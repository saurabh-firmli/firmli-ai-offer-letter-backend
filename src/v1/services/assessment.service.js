import _ from "lodash";
import {Op} from "sequelize";
import mammoth from "mammoth";
import databaseModel from "../utils/database.util.js";
import logger from "../utils/logger.util.js";
import {ApiError} from "../utils/ApiError.js";
import {HTTP_RESPONSES} from "../constants/http-response-messages.constants.js";
import {APPLICATION_STATUSES, DECISION_SOURCES, NO_DECISION} from "../constants/application.constants.js";
import {AI_USAGE_STATUSES} from "../constants/aiUsage.constants.js";
import {DEFAULT_ASSESSMENT_PROMPT, DEFAULT_EXTRACTION_PROMPT, DOCUMENT_TYPE_EXAMPLES} from "../constants/ai-prompts.constants.js";
import {REVIEW_FLAG_LABELS, REVIEW_STATUSES} from "../constants/review.constants.js";
import dbHelper from "../helpers/db.helper.js";
import decisionHelper from "../helpers/decision.helper.js";
import storageHelper from "../helpers/storage.helper.js";
import openaiHelper from "../helpers/openai.helper.js";
import criteriaHelper from "../helpers/criteria.helper.js";
import eventsHelper, {EVENTS} from "../helpers/events.helper.js";
import queueHelper from "../helpers/queue.helper.js";
import zipHelper from "../helpers/zip.helper.js";
import realtimeHelper from "../helpers/realtime.helper.js";
import requestContext from "../utils/requestContext.util.js";
import aiUsageService from "./aiUsage.service.js";
import eligibilityVersionService from "./eligibilityVersion.service.js";
import settingsService from "./settings.service.js";
import userService from "./user.service.js";
import applicationDocumentService from "./applicationDocument.service.js";

const NOT_FOUND = "Assessment not found";
const NO_API_KEY = "Add your institution's OpenAI API key in Settings first";
const QUEUE = "assessment";
// A run whose AI or file storage is busy or down for a moment is tried again, 1, 2, then 4 minutes later
const RUN_ATTEMPTS = 4;
const RETRY_FIRST_DELAY_MS = 60_000;

// Worth trying again later: the AI is busy or unreachable, or the file storage failed for a moment
const isTemporary = (error) => error.retryable === true || error.statusCode === HTTP_RESPONSES.HTTP_BAD_GATEWAY.statusCode;
// Below this the fallback model reads the document again (the Settings page says "below 90%")
const EXTRACTION_FALLBACK_BELOW = 0.9;
// A mandatory criterion without a value, or less sure than this, sends the run to the escalation model
const ESCALATION_BELOW = 0.8;
const MAX_DOCUMENT_TEXT = 100_000;
// Documents of a run read by the AI at the same time (more would hit OpenAI's rate limits sooner)
const DOCUMENTS_AT_ONCE = 3;
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const EXTRACTION_SCHEMA = {
    type: "object",
    properties: {
        detected_type: {type: "string"},
        type_matches: {type: "boolean"},
        confidence: {type: "number"},
        fields: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    name: {type: "string"},
                    value: {type: "string"},
                    confidence: {type: "number"},
                    evidence: {type: "string"},
                },
                required: ["name", "value", "confidence", "evidence"],
                additionalProperties: false,
            },
        },
    },
    required: ["detected_type", "type_matches", "confidence", "fields"],
    additionalProperties: false,
};

// What the AI read from a document, in a run or on demand
const EXTRACTION_SELECT = `
    SELECT e.id, e.assessment_id AS assessmentId, e.document_id AS documentId, d.original_name AS originalName,
           dt.label AS documentType, e.status, e.detected_type AS detectedType, e.type_matches AS typeMatches, e.fields,
           e.confidence, e.model_code AS modelCode, e.error_message AS errorMessage,
           e.requested_by AS requestedById, u.name AS requestedByName, e.created_at AS createdAt
    FROM application_document_extractions e
    JOIN application_documents d ON d.id = e.document_id
    JOIN document_types dt ON dt.id = d.document_type_id
    LEFT JOIN users u ON u.id = e.requested_by
    WHERE e.deleted_at IS NULL`;

const ASSESSMENT_SCHEMA = {
    type: "object",
    properties: {
        criteria: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    criterion_id: {type: "integer"},
                    value: {type: ["string", "null"]},
                    source_document_id: {type: ["integer", "null"]},
                    evidence: {type: ["string", "null"]},
                    confidence: {type: "number"},
                    reasoning: {type: "string"},
                },
                required: ["criterion_id", "value", "source_document_id", "evidence", "confidence", "reasoning"],
                additionalProperties: false,
            },
        },
    },
    required: ["criteria"],
    additionalProperties: false,
};

/**
 * Run Assessment: the AI reads every document of an application (extraction model, fallback when
 * unsure), then finds the applicant's value for each eligibility criterion (assessment model,
 * escalation model when unsure). The backend compares the values with the criteria and decides with
 * the Settings rules: conditional_offer, rejection, or manual_review (a Manual Review case opens).
 * It runs in the background; the application shows processing / in_progress meanwhile.
 */
const assessmentService = {
    /**
     * Checks and starts a run; the work continues in the background. automatic (on submit or after a
     * return for reassessment) quietly does nothing when the institution has no OpenAI key.
     */
    start: async (applicationId, user, {automatic = false} = {}) => {
        const application = await dbHelper.selectOneOrFail(
            `SELECT a.id, a.status, a.assessment_status AS assessmentStatus, a.eligibility_version_id AS eligibilityVersionId,
                    (SELECT COUNT(*) FROM manual_reviews r WHERE r.application_id = a.id AND r.open_case = 1) AS openReviews
             FROM applications a WHERE a.id = :applicationId AND a.tenant_id = :tenantId AND a.deleted_at IS NULL`,
            {applicationId, tenantId: user.tenantId},
            "Application not found"
        );
        const conflict = (message) => ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, message);
        if (application.status === APPLICATION_STATUSES.DRAFT) throw conflict("Submit the application before assessing it");
        if (application.assessmentStatus === "in_progress") throw conflict("An assessment of this application is already running");
        if (application.openReviews) throw conflict("This application is in manual review; return it for reassessment first");

        const apiKey = await settingsService.openaiApiKey(user.tenantId);
        if (!apiKey) {
            if (automatic) return null;
            throw conflict(NO_API_KEY);
        }

        const assessment = await databaseModel.sequelize.transaction(async (transaction) => {
            // Only if no run is going: of two starts at the same moment (a double click) one wins, so the AI runs once
            const [claimed] = await databaseModel.application.update(
                {...NO_DECISION, status: "processing", assessmentStatus: "in_progress"},
                {where: {id: applicationId, [Op.or]: [{assessmentStatus: null}, {assessmentStatus: {[Op.ne]: "in_progress"}}]}, transaction}
            );
            if (!claimed) throw conflict("An assessment of this application is already running");
            await decisionHelper.supersedeLetters(applicationId, transaction);
            return databaseModel.applicationAssessment.create(
                {tenantId: user.tenantId, applicationId, eligibilityVersionId: application.eligibilityVersionId, triggeredBy: user.id},
                {transaction}
            );
        });

        try {
            await assessmentService.enqueue(assessment.id, user.tenantId, user.id);
        } catch (error) {
            // Not queued (e.g. Redis down): the run is failed, so the application does not stay "processing"
            logger.error({err: error, assessmentId: assessment.id}, "Assessment could not be queued");
            await assessmentService.fail(assessment.id, "The assessment could not be started; run it again");
            throw ApiError.of(HTTP_RESPONSES.HTTP_SERVICE_UNAVAILABLE, "The assessment could not be started, please try again");
        }
        realtimeHelper.publish(user.tenantId, "assessment.updated", {applicationId, assessmentId: assessment.id, status: "in_progress"});
        return assessment.id;
    },

    // Into the job queue; the same run is never queued twice. The OpenAI key is not put in the queue: the job reads it
    enqueue: (assessmentId, tenantId, userId) =>
        queueHelper.add(QUEUE, `assessment-${assessmentId}`, {assessmentId, tenantId, userId}, {attempts: RUN_ATTEMPTS, backoffMs: RETRY_FIRST_DELAY_MS}),

    // Called once at startup (API or worker process)
    registerWorker: (options) => queueHelper.process(QUEUE, assessmentService.runJob, options),

    // One queued run, as the user who started it (for the audit log and AI usage)
    runJob: async ({assessmentId, tenantId, userId}, {isLastAttempt}) => {
        try {
            const assessment = await dbHelper.selectOne("SELECT status FROM application_assessments WHERE id = :assessmentId AND deleted_at IS NULL", {assessmentId});
            if (assessment?.status !== "in_progress") return;
            const user = userId ? await dbHelper.selectOne("SELECT id, name, tenant_id AS tenantId FROM users WHERE id = :userId", {userId}) : null;
            const apiKey = await settingsService.openaiApiKey(tenantId);
            if (!apiKey) {
                await assessmentService.fail(assessmentId, NO_API_KEY);
                return;
            }
            await requestContext.run({user}, () => assessmentService.process(assessmentId, tenantId, apiKey, {isLastAttempt}));
        } catch (error) {
            // process() saves its own failures; this is the rest (database down, a key that cannot be decrypted):
            // tried again by the queue, and on the last try the run is failed instead of staying in progress
            if (!isLastAttempt) throw error;
            logger.error({err: error, assessmentId}, "Assessment could not be run");
            await assessmentService.fail(assessmentId, "The assessment could not be run; run it again").catch((saveError) => logger.error({err: saveError, assessmentId}, "Could not save the failure"));
        }
    },

    /**
     * The whole run. A temporary failure (AI busy, file storage down) is thrown so the queue tries the
     * run again later; any other error, or one on the last try, marks it failed so it can be run again.
     */
    process: async (assessmentId, tenantId, apiKey, {isLastAttempt = true} = {}) => {
        try {
            const run = await assessmentService.load(assessmentId, tenantId, apiKey);
            run.retryTemporary = !isLastAttempt;
            const extractions = [];
            for (const batch of _.chunk(run.documents, DOCUMENTS_AT_ONCE)) {
                extractions.push(...(await Promise.all(batch.map((document) => assessmentService.extract(run, document)))));
            }

            let values = await assessmentService.findValues(run, extractions, run.settings.assessmentModel, "assessment");
            const needsEscalation = run.criteria.some((criterion) => {
                const found = values[criterion.id];
                return criterion.isMandatory && (_.isNil(found?.value) || found.confidence < ESCALATION_BELOW);
            });
            const escalated = needsEscalation && run.settings.escalationModel.id !== run.settings.assessmentModel.id;
            if (escalated) values = await assessmentService.findValues(run, extractions, run.settings.escalationModel, "assessment_escalation");

            const results = run.criteria.map((criterion) => {
                const found = values[criterion.id] ?? {};
                return {
                    criterion,
                    result: criteriaHelper.evaluate(criterion, found.value),
                    foundValue: found.value ?? null,
                    evidence: found.evidence ?? null,
                    sourceDocumentId: _.find(run.documents, {id: found.sourceDocumentId}) ? found.sourceDocumentId : null,
                    confidence: _.isNil(found.confidence) ? null : _.clamp(found.confidence, 0, 1),
                    reasoning: found.reasoning ?? null,
                };
            });
            await assessmentService.save(run, extractions, results, assessmentService.decide(run, extractions, results), escalated);
        } catch (error) {
            if (!isLastAttempt && isTemporary(error)) {
                logger.warn({assessmentId, reason: error.message}, "Assessment will be tried again");
                throw error;
            }
            logger.error({err: error, assessmentId}, "Assessment failed");
            await assessmentService.fail(assessmentId, error.message).catch((saveError) => logger.error({err: saveError, assessmentId}, "Could not save the failure"));
        }
    },

    // Everything a run needs: the application, its documents, the criteria in force, the Settings
    load: async (assessmentId, tenantId, apiKey) => {
        const assessment = await dbHelper.selectOne(
            `SELECT id, application_id AS applicationId, eligibility_version_id AS versionId, triggered_by AS triggeredBy
             FROM application_assessments WHERE id = :assessmentId`,
            {assessmentId}
        );
        const [application, documents, settings, criteria, requirements] = await Promise.all([
            dbHelper.selectOne(
                `SELECT a.id, DATE_FORMAT(a.application_date, '%Y-%m-%d') AS applicationDate,
                        DATE_FORMAT(s.date_of_birth, '%Y-%m-%d') AS dateOfBirth, nc.name AS nationality, rc.name AS residenceCountry
                 FROM applications a JOIN students s ON s.id = a.student_id
                 LEFT JOIN countries nc ON nc.id = s.nationality_id LEFT JOIN countries rc ON rc.id = s.residence_country_id
                 WHERE a.id = :applicationId`,
                {applicationId: assessment.applicationId}
            ),
            dbHelper.select(
                `SELECT d.id, d.document_type_id AS documentTypeId, dt.code AS documentTypeCode, dt.label AS documentType, d.original_name AS originalName,
                        d.storage_key AS storageKey, d.mime_type AS mimeType
                 FROM application_documents d JOIN document_types dt ON dt.id = d.document_type_id
                 WHERE d.application_id = :applicationId AND d.deleted_at IS NULL ORDER BY d.id`,
                {applicationId: assessment.applicationId}
            ),
            assessmentService.aiSettings(tenantId),
            eligibilityVersionService.criteriaOf(assessment.versionId),
            eligibilityVersionService.documentRequirementsOf(assessment.versionId),
        ]);
        return {
            assessment,
            tenantId,
            apiKey,
            application,
            documents,
            settings,
            requirements,
            criteria: criteria.filter((criterion) => criteriaHelper.isInForce(criterion, application.applicationDate)),
        };
    },

    aiSettings: async (tenantId) => {
        const row = await dbHelper.selectOne(
            `SELECT s.extraction_prompt AS extractionPrompt, s.assessment_prompt AS assessmentPrompt, s.verify_document_type AS verifyDocumentType,
                    s.flag_low_confidence AS flagLowConfidence, s.flag_missing_documents AS flagMissingDocuments,
                    s.require_manual_review_edge_cases AS requireManualReviewEdgeCases,
                    s.offer_confidence_threshold AS offerThreshold, s.rejection_confidence_threshold AS rejectionThreshold,
                    s.default_reviewer_id AS defaultReviewerId,
                    em.id AS extractionId, em.code AS extractionCode, fm.id AS fallbackId, fm.code AS fallbackCode,
                    am.id AS assessmentId, am.code AS assessmentCode, xm.id AS escalationId, xm.code AS escalationCode
             FROM tenant_settings s
             JOIN ai_models em ON em.id = s.extraction_model_id JOIN ai_models fm ON fm.id = s.extraction_fallback_model_id
             JOIN ai_models am ON am.id = s.assessment_model_id JOIN ai_models xm ON xm.id = s.assessment_escalation_model_id
             WHERE s.tenant_id = :tenantId AND s.deleted_at IS NULL`,
            {tenantId}
        );
        return {
            ..._.mapValues(_.pick(row, ["verifyDocumentType", "flagLowConfidence", "flagMissingDocuments", "requireManualReviewEdgeCases"]), Boolean),
            offerThreshold: row.offerThreshold,
            rejectionThreshold: row.rejectionThreshold,
            extractionPrompt: row.extractionPrompt || DEFAULT_EXTRACTION_PROMPT,
            assessmentPrompt: row.assessmentPrompt || DEFAULT_ASSESSMENT_PROMPT,
            defaultReviewerId: row.defaultReviewerId,
            extractionModel: {id: row.extractionId, code: row.extractionCode},
            fallbackModel: {id: row.fallbackId, code: row.fallbackCode},
            assessmentModel: {id: row.assessmentId, code: row.assessmentCode},
            escalationModel: {id: row.escalationId, code: row.escalationCode},
        };
    },

    // One document: the extraction model reads it; when unsure, the fallback model reads it again
    extract: async (run, document) => {
        let content;
        try {
            content = await assessmentService.documentContent(document);
        } catch (error) {
            if (run.retryTemporary && isTemporary(error)) throw error;
            return {document, status: "failed", error: `The file could not be read: ${error.message}`};
        }
        if (!content) return {document, status: "unsupported", error: `${document.mimeType} files cannot be read by the AI`};

        const wanted = run.criteria
            .filter((criterion) => !criterion.documentTypeIds.length || criterion.documentTypeIds.includes(document.documentTypeId))
            .map((criterion) => `- ${criterion.name}${criterion.unit ? ` (${criterion.unit})` : ""}${criterion.evidenceInstructions ? `: ${criterion.evidenceInstructions}` : ""}`);
        const request = {
            instructions: run.settings.extractionPrompt.replaceAll("{category}", document.documentType),
            content: [
                ...content,
                openaiHelper.text(`Declared document type: ${assessmentService.declaredType(document)}\nFile name: ${document.originalName}\nFields to look for:\n${wanted.join("\n") || "- (any admission-relevant fields)"}`),
            ],
            schemaName: "document_extraction",
            schema: EXTRACTION_SCHEMA,
        };

        try {
            let reading = await assessmentService.callAi(run, run.settings.extractionModel, "extraction", request, document.id);
            let model = run.settings.extractionModel;
            if (reading.confidence < EXTRACTION_FALLBACK_BELOW && run.settings.fallbackModel.id !== model.id) {
                const second = await assessmentService.callAi(run, run.settings.fallbackModel, "extraction_fallback", request, document.id);
                if (second.confidence >= reading.confidence) [reading, model] = [second, run.settings.fallbackModel];
            }
            return {
                document,
                status: "completed",
                detectedType: reading.detected_type,
                typeMatches: run.settings.verifyDocumentType ? reading.type_matches : null,
                fields: reading.fields.map((field) => ({...field, confidence: _.clamp(field.confidence, 0, 1)})),
                confidence: _.clamp(reading.confidence, 0, 1),
                modelCode: model.code,
            };
        } catch (error) {
            if (run.retryTemporary && isTemporary(error)) throw error;
            return {document, status: "failed", error: error.message};
        }
    },

    /**
     * "Extract" on the Documents tab: the AI reads one document now, as a run would (fallback model
     * when unsure), looking for the fields of the application's criteria. Saved without a run; it never
     * changes an assessment. Allowed in any status, a draft too.
     */
    extractDocument: async (documentId, user) => {
        const document = await dbHelper.selectOneOrFail(
            `SELECT d.id, d.application_id AS applicationId, d.document_type_id AS documentTypeId, dt.code AS documentTypeCode, dt.label AS documentType,
                    d.original_name AS originalName, d.storage_key AS storageKey, d.mime_type AS mimeType,
                    COALESCE(a.eligibility_version_id,
                             (SELECT v.id FROM eligibility_set_versions v JOIN programs p ON p.eligibility_set_id = v.eligibility_set_id
                              WHERE p.id = a.program_id AND v.status = 'published' AND v.deleted_at IS NULL LIMIT 1)) AS versionId
             FROM application_documents d
             JOIN document_types dt ON dt.id = d.document_type_id
             JOIN applications a ON a.id = d.application_id AND a.deleted_at IS NULL
             WHERE d.id = :documentId AND a.tenant_id = :tenantId AND d.deleted_at IS NULL`,
            {documentId, tenantId: user.tenantId},
            "Document not found"
        );
        const apiKey = await settingsService.openaiApiKey(user.tenantId);
        if (!apiKey) throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, NO_API_KEY);

        const run = {
            assessment: {id: null},
            tenantId: user.tenantId,
            apiKey,
            application: {id: document.applicationId},
            settings: await assessmentService.aiSettings(user.tenantId),
            criteria: document.versionId ? await eligibilityVersionService.criteriaOf(document.versionId) : [],
        };
        const extraction = await assessmentService.extract(run, document);
        const created = await databaseModel.applicationDocumentExtraction.create({
            ...assessmentService.extractionColumns(extraction),
            assessmentId: null,
            requestedBy: user.id,
        });
        return assessmentService.toExtraction(await dbHelper.selectOne(`${EXTRACTION_SELECT} AND e.id = :id`, {id: created.id}));
    },

    // The newest reading of a document, from a run or on demand; null when it was never read
    latestExtraction: async (documentId, tenantId) => {
        await applicationDocumentService.findInTenant(documentId, tenantId);
        const row = await dbHelper.selectOne(`${EXTRACTION_SELECT} AND e.document_id = :documentId ORDER BY e.id DESC LIMIT 1`, {documentId});
        return row && assessmentService.toExtraction(row);
    },

    // An extract() result as application_document_extractions columns
    extractionColumns: (extraction) => ({
        documentId: extraction.document.id,
        status: extraction.status,
        detectedType: extraction.detectedType ? _.truncate(extraction.detectedType, {length: 100}) : null,
        typeMatches: extraction.typeMatches ?? null,
        fields: extraction.fields ?? null,
        confidence: extraction.confidence ?? null,
        modelCode: extraction.modelCode ?? null,
        errorMessage: extraction.error ? _.truncate(extraction.error, {length: 500}) : null,
    }),

    toExtraction: ({requestedById, requestedByName, ...row}) => ({
        ...row,
        typeMatches: _.isNil(row.typeMatches) ? null : Boolean(row.typeMatches),
        requestedBy: requestedById ? {id: requestedById, name: requestedByName} : null,
    }),

    // "English Language Certificate (any of: IELTS Test Report Form, TOEFL score report, ...)": the type with what counts as one,
    // so a document whose own title is more specific (an IELTS form) is not taken for the wrong type
    declaredType: (document) => {
        const examples = DOCUMENT_TYPE_EXAMPLES[document.documentTypeCode];
        return examples ? `${document.documentType} (any of: ${examples})` : document.documentType;
    },

    // PDF and images go to the AI as files; a DOCX as its text. null for anything else
    documentContent: async (document) => {
        const buffer = await storageHelper.read(document.storageKey);
        if (document.mimeType === "application/pdf") return [openaiHelper.pdf(buffer, document.originalName)];
        if (document.mimeType.startsWith("image/")) return [openaiHelper.image(buffer, document.mimeType)];
        if (document.mimeType === DOCX) {
            // Checked on upload too; a file stored before that check is not unpacked either
            if (!zipHelper.unpacksWithinLimits(buffer)) throw new Error("The DOCX file is damaged, or too large once unpacked");
            const {value} = await mammoth.extractRawText({buffer});
            return [openaiHelper.text(`Text of the document:\n${value.slice(0, MAX_DOCUMENT_TEXT)}`)];
        }
        return null;
    },

    // The applicant's value for every criterion, keyed by criterion id
    findValues: async (run, extractions, model, operation) => {
        const input = {
            applicant: _.pick(run.application, ["applicationDate", "dateOfBirth", "nationality", "residenceCountry"]),
            criteria: run.criteria.map((criterion) => ({
                criterion_id: criterion.id,
                name: criterion.name,
                category: criterion.category,
                description: criterion.description,
                data_type: criterion.dataType,
                unit: criterion.unit,
                evidence_instructions: criterion.evidenceInstructions,
                check_documents: criterion.documentTypes.map((type) => type.label),
            })),
            documents: extractions
                .filter((extraction) => extraction.status === "completed")
                .map((extraction) => ({
                    document_id: extraction.document.id,
                    declared_type: extraction.document.documentType,
                    detected_type: extraction.detectedType,
                    fields: extraction.fields,
                })),
        };
        const answer = await assessmentService.callAi(run, model, operation, {
            instructions: run.settings.assessmentPrompt,
            content: [openaiHelper.text(JSON.stringify(input, null, 2))],
            schemaName: "eligibility_values",
            schema: ASSESSMENT_SCHEMA,
        });
        return _.keyBy(
            answer.criteria.map((item) => ({
                criterionId: item.criterion_id,
                value: item.value,
                sourceDocumentId: item.source_document_id,
                evidence: item.evidence,
                confidence: item.confidence,
                reasoning: item.reasoning,
            })),
            "criterionId"
        );
    },

    // One AI request, logged in AI Usage whether it works or not
    callAi: async (run, model, operation, request, documentId) => {
        const usageEntry = {tenantId: run.tenantId, applicationId: run.application.id, documentId, assessmentId: run.assessment.id, operation, modelId: model.id};
        try {
            const result = await openaiHelper.respond({apiKey: run.apiKey, model: model.code, ...request});
            await aiUsageService.record({...usageEntry, ...result.usage, durationMs: result.durationMs, providerRequestId: result.providerRequestId});
            return result.data;
        } catch (error) {
            await aiUsageService.record({
                ...usageEntry,
                ...error.usage,
                durationMs: error.durationMs,
                providerRequestId: error.providerRequestId,
                status: AI_USAGE_STATUSES.FAILED,
                errorMessage: error.message,
            });
            throw error;
        }
    },

    /**
     * The decision, with the Settings rules. Mandatory criteria decide: any not met -> rejection,
     * all met -> conditional offer, some without a value -> manual review (or rejection when edge
     * cases are not reviewed). Low confidence, missing or mismatched documents send it to manual review.
     */
    decide: (run, extractions, results) => {
        const {settings} = run;
        const mandatory = results.filter((result) => result.criterion.isMandatory);
        const lowest = (list) => (list.length ? _.min(list.map((result) => result.confidence ?? 0)) : 1);
        const notMet = mandatory.filter((result) => result.result === "not_met");
        const unclear = mandatory.filter((result) => result.result === "unclear");
        const flags = [];
        const reasons = [];
        const flag = (code, reason) => {
            if (!flags.includes(code)) flags.push(code);
            reasons.push(reason);
        };

        const uploadedTypes = _.map(run.documents, "documentTypeId");
        const missing = run.requirements.filter((requirement) => requirement.isRequired && !uploadedTypes.includes(requirement.documentTypeId));
        if (missing.length && settings.flagMissingDocuments) {
            flag("missing_documents", `Required documents missing: ${missing.map((requirement) => requirement.customLabel || requirement.documentType).join(", ")}`);
        }
        const mismatched = extractions.filter((extraction) => extraction.typeMatches === false);
        if (mismatched.length) {
            flag("document_mismatch", `Not the declared document type: ${mismatched.map((extraction) => `${extraction.document.originalName} (looks like ${extraction.detectedType})`).join(", ")}`);
        }
        const unreadable = extractions.filter((extraction) => extraction.status !== "completed");
        if (unreadable.length) flag("unreadable_document", `Could not read: ${unreadable.map((extraction) => extraction.document.originalName).join(", ")}`);

        let outcome;
        let confidence;
        // Not met, and (when edge cases are not reviewed) without a value: what a rejection is based on
        const failing = settings.requireManualReviewEdgeCases ? notMet : [...notMet, ...unclear];
        if (!mandatory.length) {
            // Nothing was checked (every criterion optional, or none in force on the application date): never an offer by itself
            outcome = "manual_review";
            confidence = 0;
            flag("no_mandatory_criteria", "No mandatory criterion applies on the application date; check the application by hand");
        } else if (unclear.length && settings.requireManualReviewEdgeCases) {
            outcome = "manual_review";
            // How sure the AI is of the values it did find; a value it could not find has no confidence to count (0 when none was found)
            const found = mandatory.filter((result) => result.result !== "unclear");
            confidence = found.length ? lowest(found) : 0;
            reasons.push(`Some criteria need manual verification: ${unclear.map((result) => result.criterion.name).join(", ")}`);
        } else if (failing.length) {
            outcome = "rejection";
            confidence = lowest(failing);
            if (confidence < settings.rejectionThreshold && settings.flagLowConfidence) {
                flag("low_confidence", `Low confidence (${Math.round(confidence * 100)}%) for a rejection`);
            }
        } else {
            outcome = "conditional_offer";
            confidence = lowest(mandatory);
            if (confidence < settings.offerThreshold && settings.flagLowConfidence) {
                flag("low_confidence", `Low confidence (${Math.round(confidence * 100)}%) for a conditional offer`);
            }
        }

        const finalOutcome = flags.length ? "manual_review" : outcome;
        const summary =
            finalOutcome === "manual_review"
                ? `Manual review: ${reasons.join("; ")}`
                : outcome === "rejection"
                  ? `Not met: ${failing.map((result) => `${result.criterion.name} (${result.foundValue ?? "no value"})`).join(", ")}`
                  : `All ${mandatory.length} mandatory criteria met`;
        return {outcome: finalOutcome, suggestedOutcome: outcome, confidence: _.round(confidence, 2), flags, reasons, summary};
    },

    // Saves the run, moves the application on, and opens a Manual Review case when needed
    save: async (run, extractions, results, decision, escalated) => {
        const {assessment, tenantId, application} = run;
        const reviewer = run.settings.defaultReviewerId ? await userService.findAssignable(run.settings.defaultReviewerId, tenantId) : null;
        let review = null;

        await databaseModel.sequelize.transaction(async (transaction) => {
            await databaseModel.applicationDocumentExtraction.bulkCreate(
                extractions.map((extraction) => ({...assessmentService.extractionColumns(extraction), assessmentId: assessment.id})),
                {transaction}
            );
            await databaseModel.applicationAssessmentCriterion.bulkCreate(
                results.map((result) => ({
                    assessmentId: assessment.id,
                    criterionId: result.criterion.id,
                    criterionName: result.criterion.name,
                    isMandatory: result.criterion.isMandatory,
                    result: result.result,
                    foundValue: _.isNil(result.foundValue) ? null : _.truncate(String(result.foundValue), {length: 255}),
                    evidence: result.evidence,
                    sourceDocumentId: result.sourceDocumentId,
                    confidence: result.confidence,
                    reasoning: result.reasoning,
                })),
                {transaction}
            );
            await databaseModel.applicationAssessment.update(
                {
                    status: "completed",
                    outcome: decision.outcome,
                    confidence: decision.confidence,
                    summary: _.truncate(decision.summary, {length: 1000}),
                    flags: decision.flags,
                    escalated,
                    completedAt: new Date(),
                },
                {where: {id: assessment.id}, transaction}
            );
            const needsReview = decision.outcome === "manual_review";
            await databaseModel.application.update(
                {
                    status: needsReview ? APPLICATION_STATUSES.MANUAL_REVIEW : APPLICATION_STATUSES.COMPLETED,
                    assessmentStatus: "completed",
                    outcome: decision.outcome,
                    confidence: decision.confidence,
                    decisionSource: DECISION_SOURCES.AI,
                    decidedBy: null,
                    decidedAt: new Date(),
                    decisionReason: null,
                },
                {where: {id: application.id}, transaction}
            );
            if (needsReview) {
                review = await databaseModel.manualReview.create(
                    {
                        tenantId,
                        applicationId: application.id,
                        status: reviewer ? REVIEW_STATUSES.ASSIGNED : REVIEW_STATUSES.UNASSIGNED,
                        priority: decision.flags.includes("missing_documents") ? "high" : "normal",
                        reason: _.truncate(decision.reasons.join("; ") || "Manual review needed", {length: 500}),
                        flags: decision.flags.filter((code) => REVIEW_FLAG_LABELS[code]),
                        queuedAt: new Date(),
                        ...(reviewer ? {reviewerId: reviewer.id, assignedAt: new Date()} : {}),
                    },
                    {transaction}
                );
            }
        });
        realtimeHelper.publish(tenantId, "assessment.updated", {applicationId: application.id, assessmentId: assessment.id, status: "completed", outcome: decision.outcome});
        if (review) realtimeHelper.publish(tenantId, "review.updated", {applicationId: application.id, reviewId: review.id, status: review.status});
        eventsHelper.emit(EVENTS.APPLICATION_DECIDED, {applicationId: application.id, tenantId, user: {id: assessment.triggeredBy}});
    },

    // A failed run: the application goes back to submitted with assessment "failed", ready to run again
    fail: async (assessmentId, message) => {
        const assessment = await dbHelper.selectOne(
            "SELECT application_id AS applicationId, tenant_id AS tenantId FROM application_assessments WHERE id = :assessmentId",
            {assessmentId}
        );
        if (!assessment) return;
        await databaseModel.sequelize.transaction(async (transaction) => {
            await databaseModel.applicationAssessment.update(
                {status: "failed", errorMessage: _.truncate(message, {length: 500}), completedAt: new Date()},
                {where: {id: assessmentId}, transaction}
            );
            await databaseModel.application.update(
                {status: APPLICATION_STATUSES.SUBMITTED, assessmentStatus: "failed"},
                {where: {id: assessment.applicationId}, transaction}
            );
        });
        realtimeHelper.publish(assessment.tenantId, "assessment.updated", {applicationId: assessment.applicationId, assessmentId, status: "failed"});
    },

    /**
     * At startup, runs still in progress: with the queue, they are queued again (a run still in Redis is
     * not added twice, and BullMQ itself resumes runs a crashed worker left); without it, nothing can
     * resume them, so they are marked failed and can be run again.
     */
    recoverInterrupted: async () => {
        const stuck = await dbHelper.select(
            "SELECT id, tenant_id AS tenantId, triggered_by AS userId FROM application_assessments WHERE status = 'in_progress' AND deleted_at IS NULL"
        );
        for (const run of stuck) {
            if (queueHelper.enabled) await assessmentService.enqueue(run.id, run.tenantId, run.userId);
            else await assessmentService.fail(run.id, "Interrupted by a server restart; run the assessment again");
        }
        if (stuck.length) logger.warn({count: stuck.length, queued: queueHelper.enabled}, "Assessments still in progress at startup");
    },

    // The latest run of an application with its criteria results, document readings and cost
    latest: async (applicationId, tenantId) => {
        const row = await dbHelper.selectOne(
            `SELECT id FROM application_assessments WHERE application_id = :applicationId AND tenant_id = :tenantId AND deleted_at IS NULL
             ORDER BY id DESC LIMIT 1`,
            {applicationId, tenantId}
        );
        if (!row) {
            await dbHelper.selectOneOrFail(
                "SELECT id FROM applications WHERE id = :applicationId AND tenant_id = :tenantId AND deleted_at IS NULL",
                {applicationId, tenantId},
                "Application not found"
            );
            return null;
        }
        return assessmentService.getById(row.id, tenantId);
    },

    getById: async (id, tenantId) => {
        const assessment = await dbHelper.selectOneOrFail(
            `SELECT x.id, x.application_id AS applicationId, x.status, x.outcome, x.confidence, x.summary, x.flags, x.escalated,
                    x.error_message AS errorMessage, x.started_at AS startedAt, x.completed_at AS completedAt,
                    v.version_number AS eligibilityVersion, x.triggered_by AS triggeredById, u.name AS triggeredByName,
                    spent.costUsd, COALESCE(spent.tokens, 0) AS tokens
             FROM application_assessments x
             JOIN eligibility_set_versions v ON v.id = x.eligibility_version_id
             LEFT JOIN users u ON u.id = x.triggered_by
             LEFT JOIN (SELECT SUM(cost_usd) AS costUsd, SUM(input_tokens + output_tokens) AS tokens FROM ai_usage_logs WHERE assessment_id = :id) spent ON TRUE
             WHERE x.id = :id AND x.tenant_id = :tenantId AND x.deleted_at IS NULL`,
            {id, tenantId},
            NOT_FOUND
        );
        const [criteria, documents] = await Promise.all([
            dbHelper.select(
                `SELECT c.criterion_id AS criterionId, c.criterion_name AS name, c.is_mandatory AS isMandatory, c.result,
                        c.found_value AS foundValue, c.evidence, c.source_document_id AS sourceDocumentId, c.confidence, c.reasoning,
                        ec.operator, ec.required_value AS requiredValue, ec.unit, ec.data_type AS dataType,
                        c.override_result AS overrideResult, c.override_note AS overrideNote, c.overridden_at AS overriddenAt,
                        c.overridden_by AS overriddenById, ob.name AS overriddenByName
                 FROM application_assessment_criteria c JOIN eligibility_criteria ec ON ec.id = c.criterion_id
                 LEFT JOIN users ob ON ob.id = c.overridden_by
                 WHERE c.assessment_id = :id AND c.deleted_at IS NULL ORDER BY ec.sort_order, c.id`,
                {id}
            ),
            dbHelper.select(`${EXTRACTION_SELECT} AND e.assessment_id = :id ORDER BY e.id`, {id}),
        ]);
        const results = criteria.map(({overrideResult, overrideNote, overriddenAt, overriddenById, overriddenByName, ...criterion}) => ({
            ...criterion,
            isMandatory: Boolean(criterion.isMandatory),
            override: overrideResult
                ? {result: overrideResult, note: overrideNote, by: overriddenById ? {id: overriddenById, name: overriddenByName} : null, at: overriddenAt}
                : null,
            finalResult: overrideResult ?? criterion.result,
        }));
        return {
            ..._.omit(assessment, ["triggeredById", "triggeredByName"]),
            escalated: Boolean(assessment.escalated),
            flags: (assessment.flags ?? []).map((code) => ({code, label: REVIEW_FLAG_LABELS[code] ?? code})),
            triggeredBy: assessment.triggeredById ? {id: assessment.triggeredById, name: assessment.triggeredByName} : null,
            criteria: results,
            suggestedOutcome: assessmentService.criteriaOutcome(results),
            documents: documents.map(assessmentService.toExtraction),
        };
    },

    // What the criteria alone say, with the reviewers' overrides: a hint for the decision, not the decision
    criteriaOutcome: (criteria) => {
        const mandatory = criteria.filter((criterion) => criterion.isMandatory);
        if (mandatory.some((criterion) => criterion.finalResult === "not_met")) return "rejection";
        if (mandatory.every((criterion) => criterion.finalResult === "met")) return "conditional_offer";
        return "manual_review";
    },

    // Every run of an application, newest first
    history: (applicationId, tenantId) =>
        dbHelper.select(
            `SELECT x.id, x.status, x.outcome, x.confidence, x.started_at AS startedAt, x.completed_at AS completedAt,
                    (SELECT SUM(l.cost_usd) FROM ai_usage_logs l WHERE l.assessment_id = x.id) AS costUsd
             FROM application_assessments x
             WHERE x.application_id = :applicationId AND x.tenant_id = :tenantId AND x.deleted_at IS NULL ORDER BY x.id DESC`,
            {applicationId, tenantId}
        ),
};

export default assessmentService;
