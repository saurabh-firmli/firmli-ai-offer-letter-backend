import {randomInt} from "node:crypto";
import _ from "lodash";
import databaseModel from "../utils/database.util.js";
import logger from "../utils/logger.util.js";
import {ApiError} from "../utils/ApiError.js";
import {HTTP_RESPONSES} from "../constants/http-response-messages.constants.js";
import {
    APPLICATION_STATUS_LABELS,
    APPLICATION_STATUSES,
    ASSESSMENT_PENDING,
    ASSESSMENT_STATUS_LABELS,
    GENDER_LABELS,
    INTAKE_TERM_LABELS,
    INTAKE_TERMS,
    INTAKE_YEARS_AHEAD,
    MAX_UPLOAD_MB,
    UPLOAD_TYPES,
} from "../constants/application.constants.js";
import {LETTER_TYPE_LABELS} from "../constants/letter-template.constants.js";
import {REVIEW_STATUSES} from "../constants/review.constants.js";
import {STUDY_MODE_LABELS} from "../constants/program.constants.js";
import dbHelper from "../helpers/db.helper.js";
import storageHelper from "../helpers/storage.helper.js";
import realtimeHelper from "../helpers/realtime.helper.js";
import responseHelper from "../helpers/response.helper.js";
import decisionHelper from "../helpers/decision.helper.js";
import applicationDocumentService from "./applicationDocument.service.js";
import eligibilityVersionService from "./eligibilityVersion.service.js";
import userService from "./user.service.js";
import settingsService from "./settings.service.js";
import assessmentService from "./assessment.service.js";

const NOT_FOUND = "Application not found";
const DUPLICATE = "This student already has an application for this program and intake";
const EMAIL_TAKEN = "Another student already uses this email";
const LOCKED = "A submitted application cannot be changed";
const ASSIGNABLE = "Pick a user of your institution who can log in";

const APPLICATION_SELECT = `
    SELECT a.id, a.application_number AS applicationNumber, a.status, a.assessment_status AS assessmentStatus,
           a.outcome, a.confidence, a.decision_source AS decisionSource, a.decided_by AS decidedById, db.name AS decidedByName,
           a.decided_at AS decidedAt, a.decision_reason AS decisionReason, a.intake_term AS intakeTerm, a.intake_year AS intakeYear, a.study_mode AS studyMode,
           DATE_FORMAT(a.application_date, '%Y-%m-%d') AS applicationDate,
           a.submitted_at AS submittedAt, a.created_at AS createdAt, a.updated_at AS updatedAt,
           a.eligibility_version_id AS eligibilityVersionId, v.version_number AS eligibilityVersionNumber,
           a.assigned_officer_id AS officerId, o.name AS officerName, a.submitted_by AS submittedById, sb.name AS submittedByName,
           s.id AS studentId, s.first_name AS firstName, s.middle_name AS middleName, s.last_name AS lastName,
           DATE_FORMAT(s.date_of_birth, '%Y-%m-%d') AS dateOfBirth, s.gender,
           s.nationality_id AS nationalityId, nc.name AS nationalityName,
           s.residence_country_id AS residenceCountryId, rc.name AS residenceCountryName,
           s.passport_number AS passportNumber, s.email, s.phone, s.address,
           p.id AS programId, p.name AS programName, p.code AS programCode, p.eligibility_set_id AS eligibilitySetId,
           (SELECT COUNT(*) FROM application_documents d WHERE d.application_id = a.id AND d.deleted_at IS NULL) AS documentCount,
           (SELECT JSON_OBJECT('id', l.id, 'referenceNumber', l.reference_number, 'letterType', l.letter_type, 'status', l.status,
                               'emailStatus', (SELECT e.status FROM application_emails e WHERE e.letter_id = l.id AND e.deleted_at IS NULL ORDER BY e.id DESC LIMIT 1))
            FROM application_letters l WHERE l.application_id = a.id AND l.status <> 'superseded' AND l.deleted_at IS NULL
            ORDER BY l.id DESC LIMIT 1) AS letter
    FROM applications a
    JOIN students s ON s.id = a.student_id
    JOIN programs p ON p.id = a.program_id
    LEFT JOIN countries nc ON nc.id = s.nationality_id
    LEFT JOIN countries rc ON rc.id = s.residence_country_id
    LEFT JOIN eligibility_set_versions v ON v.id = a.eligibility_version_id
    LEFT JOIN users o ON o.id = a.assigned_officer_id
    LEFT JOIN users sb ON sb.id = a.submitted_by
    LEFT JOIN users db ON db.id = a.decided_by`;

/**
 * Applications of one tenant (tenantId comes from req.user). An application is a draft until it is
 * submitted: only a draft can be edited, get documents or be deleted. Submitting locks the program's
 * published eligibility version, so later rule changes do not touch it.
 */
const applicationService = {
    // Dropdown values for the wizard and the list filters
    options: async (tenantId) => {
        const thisYear = new Date().getUTCFullYear();
        const toOptions = responseHelper.labelOptions;
        return {
            intakes: _.range(thisYear, thisYear + INTAKE_YEARS_AHEAD + 1).flatMap((year) =>
                INTAKE_TERMS.map((term) => ({term, year, label: `${INTAKE_TERM_LABELS[term]} ${year}`}))
            ),
            genders: toOptions(GENDER_LABELS),
            studyModes: toOptions(STUDY_MODE_LABELS),
            statuses: toOptions(APPLICATION_STATUS_LABELS),
            assessmentStatuses: toOptions(ASSESSMENT_STATUS_LABELS),
            outcomes: toOptions(LETTER_TYPE_LABELS),
            officers: await userService.assignable(tenantId),
            upload: {maxSizeMb: MAX_UPLOAD_MB, extensions: Object.keys(UPLOAD_TYPES)},
        };
    },

    // Newest first (by submission, drafts by creation)
    list: async (query, tenantId) => {
        const {page, limit, status, assessmentStatus, outcome, letterStatus, programId, officerId, intakeTerm, intakeYear, submittedFrom, submittedTo, search} =
            query;
        const conditions = ["a.tenant_id = :tenantId", "a.deleted_at IS NULL"];
        if (status) conditions.push("a.status = :status");
        if (assessmentStatus) conditions.push("a.assessment_status = :assessmentStatus");
        if (outcome) conditions.push("a.outcome = :outcome");
        if (letterStatus === "none") {
            conditions.push("NOT EXISTS (SELECT 1 FROM application_letters l WHERE l.application_id = a.id AND l.status <> 'superseded' AND l.deleted_at IS NULL)");
        } else if (letterStatus) {
            conditions.push(`EXISTS (SELECT 1 FROM application_letters l WHERE l.application_id = a.id AND l.status = :letterStatus AND l.deleted_at IS NULL)`);
        }
        if (programId) conditions.push("a.program_id = :programId");
        if (officerId) conditions.push("a.assigned_officer_id = :officerId");
        if (intakeTerm) conditions.push("a.intake_term = :intakeTerm");
        if (intakeYear) conditions.push("a.intake_year = :intakeYear");
        if (submittedFrom) conditions.push("a.submitted_at >= :submittedFrom");
        if (submittedTo) conditions.push("a.submitted_at < DATE_ADD(:submittedTo, INTERVAL 1 DAY)");
        if (search) {
            conditions.push(`(a.application_number LIKE :search OR s.email LIKE :search
                OR CONCAT_WS(' ', s.first_name, s.middle_name, s.last_name) LIKE :search OR CONCAT_WS(' ', s.first_name, s.last_name) LIKE :search)`);
        }

        const where = `WHERE ${conditions.join(" AND ")}`;
        return dbHelper.paginate({
            countSql: `SELECT COUNT(*) AS total FROM applications a JOIN students s ON s.id = a.student_id ${where}`,
            rowsSql: `${APPLICATION_SELECT} ${where} ORDER BY COALESCE(a.submitted_at, a.created_at) DESC, a.id DESC LIMIT :limit OFFSET :offset`,
            replacements: {...query, tenantId, search: search && dbHelper.likePattern(search)},
            page,
            limit,
            mapRow: applicationService.toResponse,
        });
    },

    /**
     * One application with its documents, grouped by the document requirements of its eligibility
     * version: the locked one once submitted, else the program's currently published one.
     */
    getById: async (id, tenantId) => {
        const row = await dbHelper.selectOneOrFail(
            `${APPLICATION_SELECT} WHERE a.id = :id AND a.tenant_id = :tenantId AND a.deleted_at IS NULL`,
            {id, tenantId},
            NOT_FOUND
        );
        const version = row.eligibilityVersionId
            ? {id: row.eligibilityVersionId, versionNumber: row.eligibilityVersionNumber}
            : await applicationService.publishedVersionOf(row.eligibilitySetId);
        const [documents, requirements] = await Promise.all([
            applicationDocumentService.listFor(id),
            version ? eligibilityVersionService.documentRequirementsOf(version.id) : [],
        ]);

        const documentsByType = _.groupBy(documents, "documentTypeId");
        const documentRequirements = requirements.map((requirement) => ({
            ..._.pick(requirement, ["documentTypeId", "documentType", "customLabel", "instructions", "isRequired"]),
            documents: documentsByType[requirement.documentTypeId] ?? [],
        }));
        const requiredTypeIds = _.map(requirements, "documentTypeId");

        return {
            ...applicationService.toResponse(row),
            eligibilityVersion: version ? {...version, locked: Boolean(row.eligibilityVersionId)} : null,
            documentRequirements,
            otherDocuments: documents.filter((document) => !requiredTypeIds.includes(document.documentTypeId)),
            missingDocuments: documentRequirements
                .filter((requirement) => requirement.isRequired && !requirement.documents.length)
                .map((requirement) => requirement.customLabel || requirement.documentType),
        };
    },

    // Steps 1 and 2 of the wizard: the student (found by email, or new) and the program; starts as a draft
    create: async ({student, ...values}, tenantId) => {
        const program = await applicationService.activeProgram(values.programId, tenantId);
        await applicationService.assertCountries(student);
        const applicationNumber = await applicationService.newNumber(tenantId);

        const application = await dbHelper.saveOrConflict(
            () =>
                databaseModel.sequelize.transaction(async (transaction) => {
                    const studentId = await applicationService.saveStudent(student, tenantId, transaction);
                    return databaseModel.application.create(
                        {
                            ...values,
                            tenantId,
                            applicationNumber,
                            studentId,
                            studyMode: values.studyMode ?? program.studyMode,
                            applicationDate: values.applicationDate ?? new Date().toISOString().slice(0, 10),
                        },
                        {transaction}
                    );
                }),
            DUPLICATE
        );
        return applicationService.getById(application.id, tenantId);
    },

    // Draft only. Student fields change the student, who may have other applications too
    update: async (id, {student, ...values}, tenantId) => {
        const application = await applicationService.findDraft(id, tenantId);
        if (values.programId) await applicationService.activeProgram(values.programId, tenantId);
        if (student) await applicationService.assertCountries(student);

        await databaseModel.sequelize.transaction(async (transaction) => {
            if (student) {
                await dbHelper.saveOrConflict(
                    () => databaseModel.student.update(dbHelper.emptyToNull(student), {where: {id: application.studentId}, transaction}),
                    EMAIL_TAKEN
                );
            }
            if (!_.isEmpty(values)) {
                await dbHelper.saveOrConflict(() => databaseModel.application.update(values, {where: {id}, transaction}), DUPLICATE);
            }
        });
        return applicationService.getById(id, tenantId);
    },

    // Draft only, with its documents (soft delete); the student stays
    remove: async (id, tenantId) => {
        await applicationService.findDraft(id, tenantId);
        await databaseModel.sequelize.transaction(async (transaction) => {
            await applicationDocumentService.removeForApplication(id, transaction);
            await databaseModel.application.destroy({where: {id}, transaction});
        });
    },

    // Step 4: locks the program's published eligibility version. Missing documents do not block it
    submit: async (id, user) => {
        const application = await applicationService.findDraft(id, user.tenantId);
        const program = await dbHelper.selectOne(
            "SELECT status, eligibility_set_id AS eligibilitySetId FROM programs WHERE id = :programId AND deleted_at IS NULL",
            {programId: application.programId}
        );
        if (program?.status !== "active") throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, "The program is no longer active");
        const version = await applicationService.publishedVersionOf(program.eligibilitySetId);
        if (!version) {
            throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, "The program has no published eligibility criteria; publish them first");
        }

        await databaseModel.application.update(
            {
                status: APPLICATION_STATUSES.SUBMITTED,
                assessmentStatus: ASSESSMENT_PENDING,
                eligibilityVersionId: version.id,
                submittedAt: new Date(),
                submittedBy: user.id,
            },
            {where: {id}}
        );
        await applicationService.autoAssess(id, user);
        return applicationService.getById(id, user.tenantId);
    },

    // With "Automatic assessment" on in Settings (and an OpenAI key), a submitted application is assessed at once
    autoAssess: async (id, user) => {
        try {
            const {autoAssessment} = await settingsService.flags(user.tenantId);
            if (autoAssessment) await assessmentService.start(id, user, {automatic: true});
        } catch (error) {
            logger.warn({err: error, applicationId: id}, "Automatic assessment did not start");
        }
    },

    // Any status: who handles the application. null unassigns
    assignOfficer: async (id, officerId, tenantId) => {
        await applicationService.findInTenant(id, tenantId);
        if (officerId && !(await userService.findAssignable(officerId, tenantId))) throw ApiError.validation({officerId: ASSIGNABLE});
        await databaseModel.application.update({assignedOfficerId: officerId}, {where: {id}});
        return applicationService.getById(id, tenantId);
    },

    /**
     * Change outcome of a decided (completed) application, with the reason. One in manual review is
     * decided in the Manual Review Queue instead.
     */
    changeOutcome: async (id, {outcome, reason}, user) => {
        const application = await applicationService.findInTenant(id, user.tenantId);
        if (application.status === APPLICATION_STATUSES.MANUAL_REVIEW) {
            throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, "This application is in manual review; decide it in the Manual Review Queue");
        }
        if (application.status !== APPLICATION_STATUSES.COMPLETED) {
            throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, "Only a decided application's outcome can be changed");
        }
        if (application.outcome === outcome) throw ApiError.validation({outcome: "This is already the outcome"});

        await databaseModel.sequelize.transaction((transaction) => decisionHelper.recordManual(id, {outcome, reason}, user, transaction));
        return applicationService.getById(id, user.tenantId);
    },

    // A draft, or an application in manual review (the reviewer adds documents they asked for)
    uploadDocument: async (id, documentTypeId, file, user) => {
        const application = await applicationService.findInTenant(id, user.tenantId);
        if (![APPLICATION_STATUSES.DRAFT, APPLICATION_STATUSES.MANUAL_REVIEW].includes(application.status)) {
            throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, "Documents can only be added to a draft or an application in manual review");
        }
        const type = await dbHelper.selectOne("SELECT id FROM document_types WHERE id = :documentTypeId AND deleted_at IS NULL", {
            documentTypeId,
        });
        if (!type) throw ApiError.validation({documentTypeId: "Document type not found"});
        const document = await applicationDocumentService.create(application, documentTypeId, file, user.id);
        // A case waiting for the student's documents goes back to its reviewer
        const [reopened] = await databaseModel.manualReview.update(
            {status: REVIEW_STATUSES.IN_REVIEW},
            {where: {applicationId: application.id, status: REVIEW_STATUSES.WAITING_DOCUMENTS}}
        );
        if (reopened) realtimeHelper.publish(user.tenantId, "review.updated", {applicationId: application.id, status: REVIEW_STATUSES.IN_REVIEW});
        return document;
    },

    removeDocument: async (documentId, tenantId) => {
        const document = await applicationDocumentService.findInTenant(documentId, tenantId);
        if (document.applicationStatus !== APPLICATION_STATUSES.DRAFT) throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, LOCKED);
        await applicationDocumentService.remove(documentId);
    },

    // Readable in any status
    documentDownloadUrl: async (documentId, tenantId) => {
        const document = await applicationDocumentService.findInTenant(documentId, tenantId);
        return storageHelper.downloadUrl(document.storageKey, document.originalName);
    },

    findInTenant: (id, tenantId) =>
        dbHelper.selectOneOrFail(
            `SELECT id, tenant_id AS tenantId, student_id AS studentId, program_id AS programId, status, outcome
             FROM applications WHERE id = :id AND tenant_id = :tenantId AND deleted_at IS NULL`,
            {id, tenantId},
            NOT_FOUND
        ),

    findDraft: async (id, tenantId) => {
        const application = await applicationService.findInTenant(id, tenantId);
        if (application.status !== APPLICATION_STATUSES.DRAFT) throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, LOCKED);
        return application;
    },

    // New applications can only be made for an active program of this tenant
    activeProgram: async (programId, tenantId) => {
        const program = await dbHelper.selectOne(
            `SELECT id, status, study_mode AS studyMode FROM programs
             WHERE id = :programId AND tenant_id = :tenantId AND deleted_at IS NULL`,
            {programId, tenantId}
        );
        if (program?.status !== "active") throw ApiError.validation({programId: "Pick an active program"});
        return program;
    },

    publishedVersionOf: (eligibilitySetId) =>
        eligibilitySetId
            ? dbHelper.selectOne(
                  `SELECT id, version_number AS versionNumber FROM eligibility_set_versions
                   WHERE eligibility_set_id = :eligibilitySetId AND status = 'published' AND deleted_at IS NULL`,
                  {eligibilitySetId}
              )
            : null,

    assertCountries: async (student) => {
        const fields = ["nationalityId", "residenceCountryId"].filter((field) => student[field]);
        if (!fields.length) return;
        const known = _.map(
            await dbHelper.select("SELECT id FROM countries WHERE id IN (:ids) AND deleted_at IS NULL", {
                ids: fields.map((field) => student[field]),
            }),
            "id"
        );
        const errors = _.fromPairs(fields.filter((field) => !known.includes(student[field])).map((field) => [`student.${field}`, "Country not found"]));
        if (!_.isEmpty(errors)) throw ApiError.validation(errors);
    },

    // A student is one row per email in the tenant: an existing one is updated with the new details
    saveStudent: async (student, tenantId, transaction) => {
        const columns = dbHelper.emptyToNull(student);
        const existing = await dbHelper.selectOne(
            "SELECT id FROM students WHERE tenant_id = :tenantId AND email = :email AND deleted_at IS NULL",
            {tenantId, email: student.email},
            {transaction}
        );
        if (existing) {
            await databaseModel.student.update(columns, {where: {id: existing.id}, transaction});
            return existing.id;
        }
        return (await databaseModel.student.create({...columns, tenantId}, {transaction})).id;
    },

    // APP- and 8 random digits, unused in the tenant (random, so the numbers do not reveal volumes)
    newNumber: async (tenantId) => {
        for (;;) {
            const applicationNumber = `APP-${randomInt(10_000_000, 100_000_000)}`;
            const taken = await dbHelper.selectOne(
                "SELECT id FROM applications WHERE tenant_id = :tenantId AND application_number = :applicationNumber",
                {tenantId, applicationNumber}
            );
            if (!taken) return applicationNumber;
        }
    },

    toResponse: (row) => ({
        id: row.id,
        applicationNumber: row.applicationNumber,
        status: row.status,
        assessmentStatus: row.assessmentStatus,
        outcome: row.outcome,
        confidence: row.confidence,
        decision: row.decisionSource
            ? {
                  source: row.decisionSource,
                  by: row.decidedById ? {id: row.decidedById, name: row.decidedByName} : null,
                  at: row.decidedAt,
                  reason: row.decisionReason,
              }
            : null,
        student: {
            id: row.studentId,
            firstName: row.firstName,
            middleName: row.middleName,
            lastName: row.lastName,
            fullName: _.compact([row.firstName, row.middleName, row.lastName]).join(" "),
            dateOfBirth: row.dateOfBirth,
            gender: row.gender,
            nationality: row.nationalityId ? {id: row.nationalityId, name: row.nationalityName} : null,
            residenceCountry: row.residenceCountryId ? {id: row.residenceCountryId, name: row.residenceCountryName} : null,
            passportNumber: row.passportNumber,
            email: row.email,
            phone: row.phone,
            address: row.address,
        },
        program: {id: row.programId, name: row.programName, code: row.programCode},
        intakeTerm: row.intakeTerm,
        intakeYear: row.intakeYear,
        intake: `${INTAKE_TERM_LABELS[row.intakeTerm]} ${row.intakeYear}`,
        studyMode: row.studyMode,
        applicationDate: row.applicationDate,
        documentCount: row.documentCount,
        letter: row.letter ?? null,
        eligibilityVersion: row.eligibilityVersionId
            ? {id: row.eligibilityVersionId, versionNumber: row.eligibilityVersionNumber, locked: true}
            : null,
        officer: row.officerId ? {id: row.officerId, name: row.officerName} : null,
        submittedAt: row.submittedAt,
        submittedBy: row.submittedById ? {id: row.submittedById, name: row.submittedByName} : null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    }),
};

export default applicationService;
