import _ from "lodash";
import {Op} from "sequelize";
import databaseModel from "../utils/database.util.js";
import {ApiError} from "../utils/ApiError.js";
import {HTTP_RESPONSES} from "../constants/http-response-messages.constants.js";
import {APPLICATION_STATUSES, ASSESSMENT_PENDING} from "../constants/application.constants.js";
import {MODULES} from "../constants/module.constants.js";
import {STUDENT_EMAIL_STATUSES} from "../constants/communication.constants.js";
import {
    EMAIL_STATUSES,
    REVIEW_FLAG_LABELS,
    REVIEW_PRIORITY_LABELS,
    RESOLUTION_BY_OUTCOME,
    REVIEW_RESOLUTION_LABELS,
    REVIEW_RESOLUTIONS,
    REVIEW_STATUS_LABELS,
    REVIEW_STATUSES,
} from "../constants/review.constants.js";
import dbHelper from "../helpers/db.helper.js";
import {EMAIL_NOT_CONFIGURED} from "../helpers/email.helper.js";
import auditHelper from "../helpers/audit.helper.js";
import realtimeHelper from "../helpers/realtime.helper.js";
import responseHelper from "../helpers/response.helper.js";
import decisionHelper from "../helpers/decision.helper.js";
import applicationEmails from "../emails/application.email.js";
import roleService from "./role.service.js";
import userService from "./user.service.js";
import applicationService from "./application.service.js";
import applicationNoteService from "./applicationNote.service.js";
import assessmentService from "./assessment.service.js";
import communicationService from "./communication.service.js";
import letterService from "./letter.service.js";

const NOT_FOUND = "Review not found";
const RESOLVED = "This review is already resolved";

// Required documents of the application's locked criteria version that have no file
const MISSING_DOCUMENTS_COUNT = `(
    SELECT COUNT(*) FROM eligibility_document_requirements dr
    WHERE dr.version_id = a.eligibility_version_id AND dr.is_required = 1 AND dr.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM application_documents d
                      WHERE d.application_id = a.id AND d.document_type_id = dr.document_type_id AND d.deleted_at IS NULL))`;

const REVIEW_SELECT = `
    SELECT r.id, r.status, r.priority, r.reason, r.flags, r.queued_at AS queuedAt,
           TIMESTAMPDIFF(SECOND, r.queued_at, COALESCE(r.resolved_at, UTC_TIMESTAMP())) AS queueSeconds,
           r.reviewer_id AS reviewerId, rv.name AS reviewerName, r.assigned_at AS assignedAt, r.assignment_note AS assignmentNote,
           r.resolution, r.resolution_note AS resolutionNote, r.resolved_at AS resolvedAt, r.resolved_by AS resolvedById, rb.name AS resolvedByName,
           a.id AS applicationId, a.application_number AS applicationNumber, a.status AS applicationStatus, a.confidence,
           s.id AS studentId, CONCAT_WS(' ', s.first_name, s.last_name) AS studentName, s.email AS studentEmail,
           p.id AS programId, p.name AS programName, ${MISSING_DOCUMENTS_COUNT} AS missingDocuments
    FROM manual_reviews r
    JOIN applications a ON a.id = r.application_id
    JOIN students s ON s.id = a.student_id
    JOIN programs p ON p.id = a.program_id
    LEFT JOIN users rv ON rv.id = r.reviewer_id
    LEFT JOIN users rb ON rb.id = r.resolved_by`;

// Open cases first, then by priority, then the longest waiting
const QUEUE_ORDER = `FIELD(r.status, 'unassigned', 'assigned', 'in_review', 'waiting_documents', 'resolved'),
    FIELD(r.priority, 'urgent', 'high', 'normal', 'low'), r.queued_at, r.id`;

/**
 * The Manual Review Queue: one case per application that needs a human. Cases are opened by the
 * AI assessment; here people assign them, ask the student for documents, override criteria results,
 * and resolve the case by a decision (offer / rejection) or by returning the application for reassessment.
 */
const manualReviewService = {
    options: async (tenantId) => {
        const toOptions = responseHelper.labelOptions;
        return {
            statuses: toOptions(REVIEW_STATUS_LABELS),
            resolutions: toOptions(REVIEW_RESOLUTION_LABELS),
            priorities: toOptions(REVIEW_PRIORITY_LABELS),
            flags: toOptions(REVIEW_FLAG_LABELS),
            reviewers: await manualReviewService.reviewers(tenantId),
        };
    },

    list: async ({page, limit, status, priority, reviewerId, mine, programId, search}, user) => {
        const conditions = ["r.tenant_id = :tenantId", "r.deleted_at IS NULL"];
        if (priority) conditions.push("r.priority = :priority");
        if (reviewerId) conditions.push("r.reviewer_id = :reviewerId");
        if (mine) conditions.push("r.reviewer_id = :userId");
        if (programId) conditions.push("a.program_id = :programId");
        if (search) {
            conditions.push(`(a.application_number LIKE :search OR CONCAT_WS(' ', s.first_name, s.last_name) LIKE :search OR s.email LIKE :search)`);
        }
        const from = "FROM manual_reviews r JOIN applications a ON a.id = r.application_id JOIN students s ON s.id = a.student_id";
        const replacements = {tenantId: user.tenantId, userId: user.id, priority, reviewerId, programId, status, search: search && dbHelper.likePattern(search)};

        // The status chips count every status under the other filters; the total is the chosen status' count
        const where = `WHERE ${conditions.join(" AND ")}`;
        const [statusCounts, rows] = await Promise.all([
            dbHelper.select(`SELECT r.status, COUNT(*) AS count ${from} ${where} GROUP BY r.status`, replacements),
            dbHelper.select(`${REVIEW_SELECT} ${where}${status ? " AND r.status = :status" : ""} ORDER BY ${QUEUE_ORDER} LIMIT :limit OFFSET :offset`, {
                ...replacements,
                limit,
                offset: (page - 1) * limit,
            }),
        ]);
        const counts = dbHelper.countsBy(statusCounts, REVIEW_STATUS_LABELS);
        return {items: rows.map(manualReviewService.toResponse), total: status ? counts[status] : _.sum(_.values(counts)), page, limit, counts};
    },

    // One case with the documents still missing and the document requests made so far
    getById: async (id, tenantId) => {
        const row = await dbHelper.selectOneOrFail(
            `${REVIEW_SELECT} WHERE r.id = :id AND r.tenant_id = :tenantId AND r.deleted_at IS NULL`,
            {id, tenantId},
            NOT_FOUND
        );
        const [missing, requests, notes] = await Promise.all([
            dbHelper.select(
                `SELECT dr.document_type_id AS documentTypeId, COALESCE(dr.custom_label, dt.label) AS label
                 FROM applications a
                 JOIN eligibility_document_requirements dr ON dr.version_id = a.eligibility_version_id
                 JOIN document_types dt ON dt.id = dr.document_type_id
                 WHERE a.id = :applicationId AND dr.is_required = 1 AND dr.deleted_at IS NULL
                   AND NOT EXISTS (SELECT 1 FROM application_documents d
                                   WHERE d.application_id = a.id AND d.document_type_id = dr.document_type_id AND d.deleted_at IS NULL)
                 ORDER BY dr.sort_order, dr.id`,
                {applicationId: row.applicationId}
            ),
            dbHelper.select(
                `SELECT q.id, q.document_type_ids AS documentTypeIds, q.message, q.email_status AS emailStatus,
                        q.requested_by AS requestedById, u.name AS requestedByName, q.created_at AS createdAt
                 FROM application_document_requests q LEFT JOIN users u ON u.id = q.requested_by
                 WHERE q.review_id = :id AND q.deleted_at IS NULL ORDER BY q.id DESC`,
                {id}
            ),
            applicationNoteService.listFor(row.applicationId, tenantId),
        ]);
        return {
            ...manualReviewService.toResponse(row),
            studentEmail: row.studentEmail,
            assignmentNote: row.assignmentNote,
            missingDocumentTypes: missing,
            documentRequests: requests.map(({requestedById, requestedByName, ...request}) => ({
                ...request,
                requestedBy: requestedById ? {id: requestedById, name: requestedByName} : null,
            })),
            notes,
        };
    },

    // Also on a resolved case: the note is linked to the case and shows on the application too
    addNote: async (id, note, user) => {
        const review = await dbHelper.selectOneOrFail(
            "SELECT id, application_id AS applicationId FROM manual_reviews WHERE id = :id AND tenant_id = :tenantId AND deleted_at IS NULL",
            {id, tenantId: user.tenantId},
            NOT_FOUND
        );
        return applicationNoteService.create({applicationId: review.applicationId, reviewId: review.id}, note, user);
    },

    // Assign or reassign: the case goes (back) to "assigned" for the new reviewer
    assign: async (id, {reviewerId, priority, note}, user) => {
        await manualReviewService.findOpen(id, user.tenantId);
        const reviewer = _.find(await manualReviewService.reviewers(user.tenantId), {id: reviewerId});
        if (!reviewer) throw ApiError.validation({reviewerId: "Pick a user who can work on manual reviews"});

        await databaseModel.manualReview.update(
            {
                reviewerId,
                status: REVIEW_STATUSES.ASSIGNED,
                assignedBy: user.id,
                assignedAt: new Date(),
                assignmentNote: note || null,
                ...(priority ? {priority} : {}),
            },
            {where: {id}}
        );
        return manualReviewService.announce(await manualReviewService.getById(id, user.tenantId), user.tenantId);
    },

    /**
     * Asks the student for documents by email and records the request. The case moves to "waiting for
     * documents" (and to the acting user if nobody had it) until a document is uploaded. The request is
     * recorded even when the email fails, with emailStatus telling the frontend.
     */
    requestDocuments: async (id, {documentTypeIds, message}, user) => {
        const review = await manualReviewService.findOpen(id, user.tenantId);
        const types = await dbHelper.select("SELECT id, label FROM document_types WHERE id IN (:documentTypeIds) AND deleted_at IS NULL", {
            documentTypeIds,
        });
        const unknown = _.difference(documentTypeIds, _.map(types, "id"));
        if (unknown.length) throw ApiError.validation({documentTypeIds: `Document types not found: ${unknown.join(", ")}`});

        const emailStatus = await manualReviewService.emailDocumentRequest(review, _.map(types, "label"), message, user);
        await databaseModel.sequelize.transaction(async (transaction) => {
            await databaseModel.applicationDocumentRequest.create(
                {applicationId: review.applicationId, reviewId: id, documentTypeIds, message: message || null, emailStatus, requestedBy: user.id},
                {transaction}
            );
            await databaseModel.manualReview.update(
                {
                    status: REVIEW_STATUSES.WAITING_DOCUMENTS,
                    ...(review.reviewerId ? {} : {reviewerId: user.id, assignedBy: user.id, assignedAt: new Date()}),
                },
                {where: {id}, transaction}
            );
        });
        return {review: manualReviewService.announce(await manualReviewService.getById(id, user.tenantId), user.tenantId), emailStatus};
    },

    // Sends the application back to the AI assessment and resolves the case
    returnForReassessment: async (id, {note}, user) => {
        const review = await manualReviewService.findOpen(id, user.tenantId);
        await databaseModel.sequelize.transaction(async (transaction) => {
            await manualReviewService.resolve(
                id,
                {resolution: REVIEW_RESOLUTIONS.RETURNED_FOR_REASSESSMENT, resolutionNote: note || null, resolvedBy: user.id},
                transaction
            );
            await decisionHelper.clear(review.applicationId, {status: APPLICATION_STATUSES.SUBMITTED, assessmentStatus: ASSESSMENT_PENDING}, transaction);
        });
        await applicationService.autoAssess(review.applicationId, user);
        return manualReviewService.announce(await manualReviewService.getById(id, user.tenantId), user.tenantId);
    },

    /**
     * The reviewer decides: conditional offer or rejection, with the reason. Resolves the case
     * ("approved" / "rejected") and completes the application with that outcome, as a manual decision.
     */
    decide: async (id, {outcome, reason}, user) => {
        const review = await manualReviewService.findOpen(id, user.tenantId);
        await databaseModel.sequelize.transaction(async (transaction) => {
            await manualReviewService.resolve(id, {resolution: RESOLUTION_BY_OUTCOME[outcome], resolutionNote: reason, resolvedBy: user.id}, transaction);
            await decisionHelper.recordManual(review.applicationId, {outcome, reason}, user, transaction);
        });
        return manualReviewService.announce(await manualReviewService.getById(id, user.tenantId), user.tenantId);
    },

    /**
     * Resolves the case only if it is still open, inside the caller's transaction: of two people deciding (or
     * returning) it at the same moment one wins; the other gets "already resolved" and their changes roll back
     */
    resolve: async (id, values, transaction) => {
        const [count] = await databaseModel.manualReview.update(
            {...values, status: REVIEW_STATUSES.RESOLVED, resolvedAt: new Date()},
            {where: {id, status: {[Op.ne]: REVIEW_STATUSES.RESOLVED}}, transaction}
        );
        if (!count) throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, RESOLVED);
    },

    // A live update for open pages (the queue, the case, the bell); answers the case
    announce: (review, tenantId) => {
        realtimeHelper.publish(tenantId, "review.updated", {applicationId: review.application.id, reviewId: review.id, status: review.status});
        return review;
    },

    /**
     * A reviewer's own result for one criterion of the application's latest completed assessment
     * (result null removes it). The AI's result stays next to it. Answers the assessment again, with
     * its suggestedOutcome after the override.
     */
    overrideCriterion: async (id, criterionId, {result, note}, user) => {
        const review = await manualReviewService.findOpen(id, user.tenantId);
        const assessment = await dbHelper.selectOne(
            `SELECT id FROM application_assessments
             WHERE application_id = :applicationId AND status = 'completed' AND deleted_at IS NULL ORDER BY id DESC LIMIT 1`,
            {applicationId: review.applicationId}
        );
        if (!assessment) throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, "This application has no completed assessment");
        const row = await dbHelper.selectOneOrFail(
            `SELECT id, criterion_name AS name, result, override_result AS overrideResult, override_note AS overrideNote
             FROM application_assessment_criteria WHERE assessment_id = :assessmentId AND criterion_id = :criterionId AND deleted_at IS NULL`,
            {assessmentId: assessment.id, criterionId},
            "Criterion not found in the latest assessment"
        );

        const values = result
            ? {overrideResult: result, overrideNote: note, overriddenBy: user.id, overriddenAt: new Date()}
            : {overrideResult: null, overrideNote: null, overriddenBy: null, overriddenAt: null};
        await databaseModel.sequelize.transaction(async (transaction) => {
            await databaseModel.applicationAssessmentCriterion.update(values, {where: {id: row.id}, transaction});
            await auditHelper.write(
                {
                    module: MODULES.REVIEWS,
                    entityType: "assessmentCriterion",
                    entityId: row.id,
                    entityLabel: row.name,
                    action: "update",
                    changes: {
                        overrideResult: {from: row.overrideResult, to: values.overrideResult},
                        overrideNote: {from: row.overrideNote, to: values.overrideNote},
                    },
                },
                transaction
            );
        });
        return assessmentService.getById(assessment.id, user.tenantId);
    },

    // Users who can log in and whose role may work on manual reviews (Manual Review update)
    reviewers: async (tenantId) => {
        const users = await userService.assignable(tenantId);
        const roleIds = _.uniq(_.map(users, "roleId"));
        const permissions = _.zipObject(roleIds, await Promise.all(roleIds.map((roleId) => roleService.permissionsOf(roleId, tenantId))));
        return users.filter((user) => permissions[user.roleId][MODULES.REVIEWS]?.update).map((user) => _.omit(user, "roleId"));
    },

    findOpen: async (id, tenantId) => {
        const review = await dbHelper.selectOneOrFail(
            `SELECT id, application_id AS applicationId, status, reviewer_id AS reviewerId
             FROM manual_reviews WHERE id = :id AND tenant_id = :tenantId AND deleted_at IS NULL`,
            {id, tenantId},
            NOT_FOUND
        );
        if (review.status === REVIEW_STATUSES.RESOLVED) throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, RESOLVED);
        return review;
    },

    /**
     * "sent", "failed", or "not_configured" when neither the client nor Firmli has a mail server.
     * The email is in the Communications log, and a failed one is retried there like any other.
     */
    emailDocumentRequest: async (review, documents, message, user) => {
        const application = await letterService.findApplication(review.applicationId, user.tenantId);
        const content = applicationEmails.documentsRequested({...application, documents, message, brand: communicationService.brandOf(application)});
        const email = await communicationService.deliver(
            {
                tenantId: application.tenantId,
                applicationId: review.applicationId,
                emailType: "document_request",
                recipient: application.studentEmail,
                subject: content.subject,
                bodyHtml: content.html,
                bodyText: content.text,
            },
            user
        );
        if (email.status === STUDENT_EMAIL_STATUSES.SENT) return EMAIL_STATUSES.SENT;
        return email.lastError === EMAIL_NOT_CONFIGURED ? EMAIL_STATUSES.NOT_CONFIGURED : EMAIL_STATUSES.FAILED;
    },

    toResponse: (row) => ({
        id: row.id,
        status: row.status,
        priority: row.priority,
        reason: row.reason,
        flags: (row.flags ?? []).map((code) => ({code, label: REVIEW_FLAG_LABELS[code] ?? code})),
        missingDocuments: row.missingDocuments,
        confidence: row.confidence,
        queuedAt: row.queuedAt,
        queueSeconds: row.queueSeconds,
        reviewer: row.reviewerId ? {id: row.reviewerId, name: row.reviewerName} : null,
        assignedAt: row.assignedAt,
        resolution: row.resolution,
        resolutionNote: row.resolutionNote,
        resolvedAt: row.resolvedAt,
        resolvedBy: row.resolvedById ? {id: row.resolvedById, name: row.resolvedByName} : null,
        application: {id: row.applicationId, applicationNumber: row.applicationNumber, status: row.applicationStatus},
        student: {id: row.studentId, name: row.studentName},
        program: {id: row.programId, name: row.programName},
    }),
};

export default manualReviewService;
