import path from "node:path";
import _ from "lodash";
import databaseModel from "../utils/database.util.js";
import logger from "../utils/logger.util.js";
import {ApiError} from "../utils/ApiError.js";
import {HTTP_RESPONSES} from "../constants/http-response-messages.constants.js";
import {APPLICATION_STATUSES, INTAKE_TERM_LABELS} from "../constants/application.constants.js";
import {OPERATOR_LABELS} from "../constants/eligibility.constants.js";
import {LETTER_TYPE_LABELS, PROGRAM_TEMPLATE_FIELDS, VARIABLE_PATTERN} from "../constants/letter-template.constants.js";
import {LETTER_STATUS_LABELS, LETTER_STATUSES, OFFER_VALID_DAYS} from "../constants/letter.constants.js";
import {DEFAULT_BRAND_COLOR} from "../constants/settings.constants.js";
import dbHelper from "../helpers/db.helper.js";
import storageHelper from "../helpers/storage.helper.js";
import pdfHelper from "../helpers/pdf.helper.js";
import templateHelper from "../helpers/template.helper.js";
import phoneHelper from "../helpers/phone.helper.js";
import emailHelper from "../helpers/email.helper.js";
import decisionHelper from "../helpers/decision.helper.js";
import eventsHelper, {EVENTS} from "../helpers/events.helper.js";
import realtimeHelper from "../helpers/realtime.helper.js";
import applicationService from "./application.service.js";
import assessmentService from "./assessment.service.js";
import eligibilityVersionService from "./eligibilityVersion.service.js";
import letterTemplateService from "./letterTemplate.service.js";
import settingsService from "./settings.service.js";

const NOT_FOUND = "Letter not found";
const conflict = (message) => ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, message);

const LETTER_COLUMNS = `
    l.id, l.application_id AS applicationId, a.application_number AS applicationNumber,
           CONCAT_WS(' ', s.first_name, s.last_name) AS studentName, s.email AS studentEmail, p.id AS programId, p.name AS programName,
           l.letter_type AS letterType, l.version, l.reference_number AS referenceNumber, l.subject, l.status,
           l.template_id AS templateId, t.name AS templateName, l.assessment_id AS assessmentId, l.pdf_size_bytes AS pdfSizeBytes,
           l.generated_by AS generatedById, g.name AS generatedByName, l.created_at AS createdAt,
           l.reviewed_by AS reviewedById, r.name AS reviewedByName, l.reviewed_at AS reviewedAt, l.review_note AS reviewNote,
           (SELECT JSON_OBJECT('id', e.id, 'status', e.status, 'sentAt', DATE_FORMAT(e.sent_at, '%Y-%m-%dT%H:%i:%s.000Z'))
            FROM application_emails e WHERE e.letter_id = l.id AND e.deleted_at IS NULL ORDER BY e.id DESC LIMIT 1) AS email`;

const LETTER_FROM = `
    FROM application_letters l
    JOIN applications a ON a.id = l.application_id
    JOIN students s ON s.id = a.student_id
    JOIN programs p ON p.id = a.program_id
    LEFT JOIN letter_templates t ON t.id = l.template_id
    LEFT JOIN users g ON g.id = l.generated_by
    LEFT JOIN users r ON r.id = l.reviewed_by
    WHERE l.deleted_at IS NULL`;

const LETTER_SELECT = `SELECT ${LETTER_COLUMNS} ${LETTER_FROM}`;

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "long", year: "numeric", timeZone: "UTC"});
const formatDate = (date) => DATE_FORMAT.format(typeof date === "string" ? new Date(`${date}T00:00:00Z`) : date);
const {escape} = emailHelper;
const textValue = (value) => ({text: String(value ?? ""), html: escape(value)});
const listValue = (items) =>
    items.length
        ? {text: items.join("; "), html: `<ul>${items.map((item) => `<li>${escape(item)}</li>`).join("")}</ul>`}
        : {text: "None", html: "<p>None</p>"};
const tableHtml = (headers, rows) =>
    `<table data-pdfmake='{"headerRows":1}'><thead><tr>${headers.map((header) => `<th>${escape(header)}</th>`).join("")}</tr></thead>` +
    `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

/**
 * Letters to students: the program's letter template for the outcome, filled with the application's
 * data ({{variables}}, the document checklist and the requirements table), saved with its PDF on S3.
 * Settings decide whether a letter is approved at once or waits for a person (Letters update).
 */
const letterService = {
    // The approvals page: current letters (not replaced ones, unless status=superseded), newest first
    list: async ({page, limit, status, letterType, programId, search}, tenantId) => {
        const conditions = ["l.tenant_id = :tenantId"];
        if (letterType) conditions.push("l.letter_type = :letterType");
        if (programId) conditions.push("a.program_id = :programId");
        if (search) {
            conditions.push("(l.reference_number LIKE :search OR a.application_number LIKE :search OR CONCAT_WS(' ', s.first_name, s.last_name) LIKE :search)");
        }
        const replacements = {tenantId, status, letterType, programId, search: search && dbHelper.likePattern(search)};
        const from = `FROM application_letters l JOIN applications a ON a.id = l.application_id JOIN students s ON s.id = a.student_id
                      WHERE l.deleted_at IS NULL AND ${conditions.join(" AND ")}`;

        const statusCondition = status ? "l.status = :status" : `l.status <> '${LETTER_STATUSES.SUPERSEDED}'`;
        const [statusCounts, rows] = await Promise.all([
            dbHelper.select(`SELECT l.status, COUNT(*) AS count ${from} GROUP BY l.status`, replacements),
            dbHelper.select(
                `${LETTER_SELECT} AND ${conditions.join(" AND ")} AND ${statusCondition} ORDER BY l.id DESC LIMIT :limit OFFSET :offset`,
                {...replacements, limit, offset: (page - 1) * limit}
            ),
        ]);
        const counts = dbHelper.countsBy(statusCounts, LETTER_STATUS_LABELS);
        const total = status ? counts[status] : _.sum(_.values(_.omit(counts, LETTER_STATUSES.SUPERSEDED)));
        return {items: rows.map(letterService.toResponse), total, page, limit, counts};
    },

    // Every letter of an application, newest first, replaced ones included
    listFor: async (applicationId, tenantId) => {
        await applicationService.findInTenant(applicationId, tenantId);
        const rows = await dbHelper.select(`${LETTER_SELECT} AND l.application_id = :applicationId ORDER BY l.id DESC`, {applicationId});
        return rows.map(letterService.toResponse);
    },

    // One letter with its HTML, as it was generated
    getById: async (id, tenantId) => {
        const row = await dbHelper.selectOneOrFail(
            `SELECT ${LETTER_COLUMNS}, l.header_html AS headerHtml, l.body_html AS bodyHtml, l.footer_html AS footerHtml
             ${LETTER_FROM} AND l.id = :id AND l.tenant_id = :tenantId`,
            {id, tenantId},
            NOT_FOUND
        );
        return {...letterService.toResponse(row), headerHtml: row.headerHtml, bodyHtml: row.bodyHtml, footerHtml: row.footerHtml};
    },

    /**
     * Generate Letter: a decided application gets its outcome's letter, one in manual review the
     * Manual Review letter. Older letters of the application are marked superseded.
     */
    generate: async (applicationId, user) => {
        const application = await letterService.findApplication(applicationId, user.tenantId);
        const letterType = letterService.letterTypeOf(application);
        const template = await letterService.templateFor(application, letterType);
        const content = letterService.render(template, await letterService.values(application, template));

        const {nextVersion} = await dbHelper.selectOne(
            "SELECT COALESCE(MAX(version), 0) + 1 AS nextVersion FROM application_letters WHERE application_id = :applicationId",
            {applicationId}
        );
        const referenceNumber = `${template.referencePrefix}-${application.applicationNumber.replace(/^APP-/, "")}-${nextVersion}`;
        const pdf = await pdfHelper.fromHtml({title: referenceNumber, ...content, brand: await letterService.brandOf(application)});
        const pdfStorageKey = `tenants/${user.tenantId}/applications/${applicationId}/letters/${referenceNumber}.pdf`;
        await storageHelper.save(pdfStorageKey, pdf, "application/pdf");

        const approved = letterService.isApprovedAutomatically(letterType, await settingsService.flags(user.tenantId));
        let letter;
        try {
            letter = await databaseModel.sequelize.transaction(async (transaction) => {
                await decisionHelper.supersedeLetters(applicationId, transaction);
                return databaseModel.applicationLetter.create(
                    {
                        tenantId: user.tenantId,
                        applicationId,
                        assessmentId: application.assessmentId,
                        templateId: template.id,
                        letterType,
                        version: nextVersion,
                        referenceNumber,
                        ...content,
                        status: approved ? LETTER_STATUSES.APPROVED : LETTER_STATUSES.PENDING_APPROVAL,
                        pdfStorageKey,
                        pdfSizeBytes: pdf.length,
                        generatedBy: user.id,
                        ...(approved ? {reviewedAt: new Date(), reviewNote: "Approved automatically (Settings)"} : {}),
                    },
                    {transaction}
                );
            });
        } catch (error) {
            // The same version generated at the same moment by someone else (unique version): its PDF has this
            // same key, so the file stays
            const duplicate = error.name === "SequelizeUniqueConstraintError";
            if (!duplicate) await storageHelper.remove(pdfStorageKey).catch(() => {});
            throw duplicate ? conflict("This letter was just generated by someone else; refresh to see it") : error;
        }
        if (approved) eventsHelper.emit(EVENTS.LETTER_APPROVED, {letterId: letter.id, tenantId: user.tenantId, user});
        return letterService.announce(await letterService.getById(letter.id, user.tenantId), user.tenantId);
    },

    approve: (id, {note}, user) => letterService.review(id, LETTER_STATUSES.APPROVED, note, user),

    reject: (id, {note}, user) => letterService.review(id, LETTER_STATUSES.REJECTED, note, user),

    review: async (id, status, note, user) => {
        const letter = await dbHelper.selectOneOrFail(
            "SELECT id, status FROM application_letters WHERE id = :id AND tenant_id = :tenantId AND deleted_at IS NULL",
            {id, tenantId: user.tenantId},
            NOT_FOUND
        );
        const notWaiting = conflict("Only a letter waiting for approval can be approved or rejected");
        if (letter.status !== LETTER_STATUSES.PENDING_APPROVAL) throw notWaiting;
        // Only while it is still waiting: of two approvals at the same moment one wins, so it is emailed once.
        // The loser's rollback also drops the audit entry its hooks wrote
        await databaseModel.sequelize.transaction(async (transaction) => {
            const [count] = await databaseModel.applicationLetter.update(
                {status, reviewedBy: user.id, reviewedAt: new Date(), reviewNote: note || null},
                {where: {id, status: LETTER_STATUSES.PENDING_APPROVAL}, transaction}
            );
            if (!count) throw notWaiting;
        });
        if (status === LETTER_STATUSES.APPROVED) eventsHelper.emit(EVENTS.LETTER_APPROVED, {letterId: id, tenantId: user.tenantId, user});
        return letterService.announce(await letterService.getById(id, user.tenantId), user.tenantId);
    },

    // A live update for open pages; answers the letter
    announce: (letter, tenantId) => {
        realtimeHelper.publish(tenantId, "letter.updated", {applicationId: letter.application.id, letterId: letter.id, status: letter.status});
        return letter;
    },

    // A short-lived link to the PDF: a download, or with inline the PDF shown in the browser (e.g. in an iframe)
    downloadUrl: async (id, tenantId, {inline = false} = {}) => {
        const letter = await dbHelper.selectOneOrFail(
            `SELECT reference_number AS referenceNumber, pdf_storage_key AS pdfStorageKey
             FROM application_letters WHERE id = :id AND tenant_id = :tenantId AND deleted_at IS NULL`,
            {id, tenantId},
            NOT_FOUND
        );
        return storageHelper.downloadUrl(letter.pdfStorageKey, `${letter.referenceNumber}.pdf`, {inline});
    },

    // A letter template filled with a real application's data, without saving anything (any status, any type)
    preview: async (templateId, applicationId, tenantId) => (await letterService.previewParts(templateId, applicationId, tenantId)).content,

    // The same preview as the PDF the student would get: letterhead, logo and brand colour included
    previewPdf: async (templateId, applicationId, tenantId) => {
        const {application, template, content} = await letterService.previewParts(templateId, applicationId, tenantId);
        return pdfHelper.fromHtml({title: `Preview: ${template.name}`, ...content, brand: await letterService.brandOf(application)});
    },

    previewParts: async (templateId, applicationId, tenantId) => {
        const [application, template] = await Promise.all([
            letterService.findApplication(applicationId, tenantId),
            letterTemplateService.getById(templateId, tenantId),
        ]);
        return {application, template, content: letterService.render(template, await letterService.values(application, template))};
    },

    letterTypeOf: (application) => {
        if (application.status === APPLICATION_STATUSES.MANUAL_REVIEW) return "manual_review";
        if (application.status === APPLICATION_STATUSES.COMPLETED && ["conditional_offer", "rejection"].includes(application.outcome)) {
            return application.outcome;
        }
        throw conflict("A letter can be generated once the application is decided or in manual review");
    },

    // The program's published template for this letter type
    templateFor: async (application, letterType) => {
        const templateId = application[PROGRAM_TEMPLATE_FIELDS[letterType]];
        const label = LETTER_TYPE_LABELS[letterType];
        if (!templateId) throw conflict(`Pick a ${label} letter template on the program first`);
        const template = await letterTemplateService.getById(templateId, application.tenantId);
        if (template.status !== "published") throw conflict(`The program's ${label} letter template is a draft; publish it first`);
        return template;
    },

    findApplication: (applicationId, tenantId) =>
        dbHelper.selectOneOrFail(
            `SELECT a.id, a.tenant_id AS tenantId, a.application_number AS applicationNumber, a.status, a.outcome, a.decision_reason AS decisionReason,
                    DATE_FORMAT(a.application_date, '%Y-%m-%d') AS applicationDate, a.decided_at AS decidedAt,
                    a.eligibility_version_id AS versionId, a.intake_term AS intakeTerm, a.intake_year AS intakeYear,
                    CONCAT_WS(' ', s.first_name, s.middle_name, s.last_name) AS studentName, s.email AS studentEmail,
                    p.name AS programName, p.code AS programCode, c.name AS campusName,
                    p.conditional_offer_template_id AS conditionalOfferTemplateId, p.rejection_template_id AS rejectionTemplateId,
                    p.manual_review_template_id AS manualReviewTemplateId,
                    t.name AS institutionName, t.address AS institutionAddress, t.website AS institutionWebsite,
                    t.contact_email AS institutionEmail, t.phone AS institutionPhone, t.logo_storage_key AS logoStorageKey, t.brand_color AS brandColor,
                    (SELECT x.id FROM application_assessments x WHERE x.application_id = a.id AND x.status = 'completed' AND x.deleted_at IS NULL
                     ORDER BY x.id DESC LIMIT 1) AS assessmentId
             FROM applications a
             JOIN students s ON s.id = a.student_id
             JOIN programs p ON p.id = a.program_id
             LEFT JOIN campuses c ON c.id = p.campus_id
             JOIN tenants t ON t.id = a.tenant_id
             WHERE a.id = :applicationId AND a.tenant_id = :tenantId AND a.deleted_at IS NULL`,
            {applicationId, tenantId},
            "Application not found"
        ),

    // {variable: {text, html}} for every {{variable}}
    values: async (application, template) => {
        const [run, criteria, requirements, documents] = await Promise.all([
            application.assessmentId ? assessmentService.getById(application.assessmentId, application.tenantId) : null,
            application.versionId ? eligibilityVersionService.criteriaOf(application.versionId) : [],
            application.versionId ? eligibilityVersionService.documentRequirementsOf(application.versionId) : [],
            dbHelper.select(
                "SELECT id, document_type_id AS documentTypeId, original_name AS originalName FROM application_documents WHERE application_id = :id AND deleted_at IS NULL ORDER BY id",
                {id: application.id}
            ),
        ]);
        const rejectionReasons = _.mapValues(_.keyBy(criteria, "id"), "rejectionReason");
        const results = run?.criteria ?? [];
        const checklist = letterService.documentChecklist(requirements, documents, run?.documents ?? []);
        const decisionDate = application.decidedAt ?? new Date();
        const reasonOf = (result) => rejectionReasons[result.criterionId] || "Requirement not met";
        // A required document without a file, or whose only files are not that kind of document, is still needed
        const stillNeeded = checklist.filter((row) => row.required && (!row.received || row.mismatch));
        const neededLabel = (row) => (row.mismatch ? `${row.label} (the file sent does not look like one)` : row.label);

        return {
            student_full_name: textValue(application.studentName),
            application_number: textValue(application.applicationNumber),
            student_email: textValue(application.studentEmail),
            program_name: textValue(application.programName),
            program_code: textValue(application.programCode),
            campus: textValue(application.campusName),
            intake: textValue(`${INTAKE_TERM_LABELS[application.intakeTerm]} ${application.intakeYear}`),
            application_date: textValue(formatDate(application.applicationDate)),
            decision_date: textValue(formatDate(decisionDate)),
            offer_expiry_date: textValue(formatDate(new Date(new Date(decisionDate).getTime() + OFFER_VALID_DAYS * 86_400_000))),
            institution_name: textValue(application.institutionName),
            institution_address: textValue(application.institutionAddress),
            institution_website: textValue(application.institutionWebsite),
            signatory_name: textValue(template.signatoryName),
            signatory_title: textValue(template.signatoryTitle),
            eligibility_table: letterService.requirementsTable(results, reasonOf, template.letterType),
            document_checklist: {
                text: checklist.map((row) => `${row.label}: ${row.status}`).join("; "),
                html: tableHtml(
                    ["Document", "Required", "Received", "Status", "File name", "Your action"],
                    checklist.map((row) => [row.label, row.required ? "Yes" : "No", row.received ? "Yes" : "No", row.status, row.fileNames, row.action])
                ),
            },
            conditions: listValue([
                ...stillNeeded.map((row) => `Submit your ${neededLabel(row)}`),
                ...results.filter((result) => !result.isMandatory && result.finalResult !== "met").map((result) => `${result.name}: ${reasonOf(result)}`),
            ]),
            unmet_requirements: letterService.unmetRequirements(application, results, reasonOf),
            missing_documents: listValue(stillNeeded.map(neededLabel)),
        };
    },

    /**
     * The reasons of a rejection: mandatory criteria not met, and (when edge cases are not reviewed) those the
     * documents did not show; a person's decision adds their reason. A rejected application never reads "None"
     */
    unmetRequirements: (application, results, reasonOf) => {
        const mandatory = results.filter((result) => result.isMandatory);
        const reasons = [
            ...mandatory.filter((result) => result.finalResult === "not_met").map((result) => `${result.name}: ${reasonOf(result)}`),
            ...mandatory.filter((result) => result.finalResult === "unclear").map((result) => `${result.name}: not shown in the documents you sent`),
            ...(application.decisionReason ? [application.decisionReason] : []),
        ];
        if (!reasons.length && application.outcome === "rejection") reasons.push("Your application does not meet the entry requirements of the program");
        return listValue(reasons);
    },

    /**
     * "Admission requirements checked": one row per criterion of the latest completed assessment, in words a
     * student reads (not how it was checked). Offers and manual review letters also say what to do; a
     * rejection does not ask for anything.
     */
    requirementsTable: (results, reasonOf, letterType) => {
        if (!results.length) return {text: "Not assessed yet", html: "<p>Not assessed yet</p>"};
        const withAction = letterType !== "rejection";
        const met = (result) => ({met: "Yes", not_met: "No"})[result.finalResult] ?? "Not shown";
        const rows = results.map((result) => [
            result.name,
            letterService.standardOf(result),
            result.foundValue ?? "Not shown in your documents",
            met(result),
            ...(withAction ? [{met: "None", not_met: reasonOf(result)}[result.finalResult] ?? "Please send evidence of this"] : []),
        ]);
        return {
            text: results.map((result) => `${result.name}: ${met(result)}`).join("; "),
            html: tableHtml(["Requirement", "Required standard", "Your result", "Met", ...(withAction ? ["Your action"] : [])], rows),
        };
    },

    // "Greater than or equal to 3.0 (GPA)", "Between 6.5 and 9 (IELTS band)", "One of: UK, Ireland"
    standardOf: ({operator, requiredValue, unit}) => {
        const values = String(requiredValue ?? "").split(",").map((value) => value.trim());
        const label = OPERATOR_LABELS[operator] ?? operator;
        const standard = operator === "between" ? `Between ${values[0]} and ${values[1]}` : operator === "one_of" ? `One of: ${values.join(", ")}` : `${label} ${values.join(", ")}`;
        return unit ? `${standard} (${unit})` : standard;
    },

    // Every document the criteria version asks for, with what was received and what the AI read
    documentChecklist: (requirements, documents, readings) => {
        const documentsByType = _.groupBy(documents, "documentTypeId");
        const readingByDocument = _.keyBy(readings, "documentId");
        const row = (documentTypeId, label, required) => {
            const files = documentsByType[documentTypeId] ?? [];
            const verified = files.some((file) => readingByDocument[file.id]?.status === "completed" && readingByDocument[file.id]?.typeMatches !== false);
            // Only when no file of it is right: a correct file sent later puts the wrong one aside
            const mismatch = !verified && files.some((file) => readingByDocument[file.id]?.typeMatches === false);
            const status = !files.length ? "Missing" : mismatch ? "Does not match its type" : verified ? "Verified" : "Received";
            const action = !files.length ? (required ? "Please submit" : "None") : mismatch ? "Please submit the correct document" : "None";
            return {label, required, received: files.length > 0, mismatch, status, fileNames: _.map(files, "originalName").join(", "), action};
        };
        return requirements.map((requirement) => row(requirement.documentTypeId, requirement.customLabel || requirement.documentType, requirement.isRequired));
    },

    // Fills {{variables}}: text in the subject, HTML in the header, body and footer (a plain-text template is made HTML first)
    render: (template, values) => {
        const fill = (text, as) => (text ? text.replace(VARIABLE_PATTERN, (match, name) => values[name]?.[as] ?? "") : null);
        const fillHtml = (text) => (text ? fill(templateHelper.toHtml(text), "html") : null);
        return {
            subject: fill(template.subject, "text"),
            headerHtml: fillHtml(template.headerHtml),
            bodyHtml: fillHtml(template.body),
            footerHtml: fillHtml(template.footerHtml),
        };
    },

    // The letterhead: the institution's logo (as inline image data), its colour and contact details
    brandOf: async (application) => ({
        color: application.brandColor ?? DEFAULT_BRAND_COLOR,
        logo: application.logoStorageKey ? await letterService.logoData(application.logoStorageKey) : null,
        name: application.institutionName,
        address: application.institutionAddress,
        website: application.institutionWebsite,
        email: application.institutionEmail,
        phone: phoneHelper.display(application.institutionPhone),
    }),

    // A logo that cannot be read leaves the letter without it rather than failing the letter
    logoData: async (key) => {
        try {
            const mimeType = path.extname(key).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
            return `data:${mimeType};base64,${(await storageHelper.read(key)).toString("base64")}`;
        } catch (error) {
            logger.warn({err: error, key}, "Logo not added to the letter");
            return null;
        }
    },

    // Offers with "Auto-approve offers"; rejections with "Auto-approve rejections" unless "Require approval for rejections".
    // Manual Review letters always wait for a person
    isApprovedAutomatically: (letterType, settings) =>
        (letterType === "conditional_offer" && settings.autoApproveOffers) ||
        (letterType === "rejection" && settings.autoApproveRejections && !settings.requireRejectionApproval),

    toResponse: (row) => ({
        id: row.id,
        referenceNumber: row.referenceNumber,
        letterType: row.letterType,
        version: row.version,
        status: row.status,
        subject: row.subject,
        application: {id: row.applicationId, applicationNumber: row.applicationNumber},
        student: {name: row.studentName, email: row.studentEmail},
        program: {id: row.programId, name: row.programName},
        template: row.templateId ? {id: row.templateId, name: row.templateName} : null,
        assessmentId: row.assessmentId,
        pdfSizeBytes: row.pdfSizeBytes,
        generatedBy: row.generatedById ? {id: row.generatedById, name: row.generatedByName} : null,
        createdAt: row.createdAt,
        reviewedBy: row.reviewedById ? {id: row.reviewedById, name: row.reviewedByName} : null,
        reviewedAt: row.reviewedAt,
        reviewNote: row.reviewNote,
        email: row.email ?? null,
    }),
};

export default letterService;
