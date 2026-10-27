import _ from "lodash";
import dbHelper from "../helpers/db.helper.js";
import {APPLICATION_STATUS_LABELS} from "../constants/application.constants.js";
import {LETTER_TYPE_LABELS} from "../constants/letter-template.constants.js";
import {REVIEW_RESOLUTION_LABELS, REVIEW_STATUS_LABELS} from "../constants/review.constants.js";
import {LETTER_STATUS_LABELS} from "../constants/letter.constants.js";
import applicationService from "./application.service.js";
import auditLogService from "./auditLog.service.js";

// The application and every record that belongs to it (deleted ones too), as audit log keys. Their
// audit rows are then looked up by (tenant_id, entity_type, entity_id), the audit log's index
const RELATED_RECORDS = `
    SELECT 'application' AS entityType, :applicationId AS entityId
    UNION ALL SELECT 'student', :studentId
    UNION ALL SELECT 'applicationDocument', id FROM application_documents WHERE application_id = :applicationId
    UNION ALL SELECT 'manualReview', id FROM manual_reviews WHERE application_id = :applicationId
    UNION ALL SELECT 'applicationDocumentRequest', id FROM application_document_requests WHERE application_id = :applicationId
    UNION ALL SELECT 'applicationNote', id FROM application_notes WHERE application_id = :applicationId
    UNION ALL SELECT 'applicationLetter', id FROM application_letters WHERE application_id = :applicationId
    UNION ALL SELECT 'assessmentCriterion', c.id FROM application_assessment_criteria c
              JOIN application_assessments x ON x.id = c.assessment_id WHERE x.application_id = :applicationId`;

// One list of events: audit log rows, plus the start and the end of each assessment run
const EVENTS = `
    SELECT 'audit' AS source, l.id, l.action, l.entity_type AS entityType, l.entity_id AS entityId, l.entity_label AS entityLabel,
           l.changes AS details, l.user_id AS userId, l.user_name AS userName, l.created_at AS at
    FROM (${RELATED_RECORDS}) k
    JOIN audit_logs l ON l.tenant_id = :tenantId AND l.entity_type = k.entityType AND l.entity_id = k.entityId AND l.deleted_at IS NULL
    UNION ALL
    SELECT 'assessment', x.id, 'started', 'assessment', x.id, NULL, NULL, x.triggered_by, u.name, x.started_at
    FROM application_assessments x LEFT JOIN users u ON u.id = x.triggered_by
    WHERE x.application_id = :applicationId AND x.deleted_at IS NULL
    UNION ALL
    SELECT 'assessment', x.id, x.status, 'assessment', x.id, NULL,
           JSON_OBJECT('outcome', x.outcome, 'confidence', x.confidence, 'summary', x.summary, 'errorMessage', x.error_message),
           NULL, NULL, x.completed_at
    FROM application_assessments x
    WHERE x.application_id = :applicationId AND x.deleted_at IS NULL AND x.completed_at IS NOT NULL
    UNION ALL
    SELECT 'email', e.id, e.status, 'email', e.id, e.subject,
           JSON_OBJECT('recipient', e.recipient, 'emailType', e.email_type, 'attempts', e.attempts, 'lastError', e.last_error),
           e.sent_by, u.name, COALESCE(e.sent_at, e.updated_at)
    FROM application_emails e LEFT JOIN users u ON u.id = e.sent_by
    WHERE e.application_id = :applicationId AND e.deleted_at IS NULL`;

const label = (labels, value) => labels[value] ?? value ?? "—";
const percent = (value) => (_.isNil(value) ? "" : ` (${Math.round(Number(value) * 100)}%)`);

/**
 * The Activity tab: the whole history of one application, newest first, each event with a short
 * title for the timeline. Everyone who may read the application sees all of it (unlike the audit log
 * page, where only the Super Admin sees other users' changes).
 */
const applicationActivityService = {
    list: async (applicationId, {page, limit}, tenantId) => {
        const application = await applicationService.findInTenant(applicationId, tenantId);
        const result = await dbHelper.paginate({
            countSql: `SELECT COUNT(*) AS total FROM (${EVENTS}) events`,
            rowsSql: `SELECT * FROM (${EVENTS}) events ORDER BY at DESC, source, id DESC LIMIT :limit OFFSET :offset`,
            replacements: {applicationId, tenantId, studentId: application.studentId},
            page,
            limit,
            mapRow: applicationActivityService.toEvent,
        });
        // details of a change: {submittedBy: {from: null, to: 5}} also gets toName: "Riya"
        return {...result, items: await auditLogService.withUserNames(result.items, "details", tenantId)};
    },

    toEvent: (row) => ({
        id: `${row.source}-${row.id}-${row.action}`,
        at: row.at,
        entityType: row.entityType,
        entityId: row.entityId,
        action: row.action,
        title: applicationActivityService.title(row),
        details: row.details ?? null,
        user: row.userId ? {id: row.userId, name: row.userName} : null,
    }),

    // "Document uploaded: transcript.pdf", "Status: Submitted → Processing", ...
    title: ({entityType, action, entityLabel, details}) => {
        const changes = details ?? {};
        const changed = (field) => changes[field] && changes[field].from !== changes[field].to;
        switch (entityType) {
            case "assessment":
                if (action === "started") return "Assessment started";
                if (action === "failed") return `Assessment failed${changes.errorMessage ? `: ${changes.errorMessage}` : ""}`;
                return `Assessment completed: ${label(LETTER_TYPE_LABELS, changes.outcome)}${percent(changes.confidence)}`;
            case "application":
                if (action === "create") return "Application created";
                if (changed("submittedAt") && changes.submittedAt.to) return "Application submitted";
                if (changed("outcome") && changes.decisionSource?.to === "manual") return `Outcome set by a person: ${label(LETTER_TYPE_LABELS, changes.outcome.to)}`;
                if (changed("status")) return `Status: ${label(APPLICATION_STATUS_LABELS, changes.status.from)} → ${label(APPLICATION_STATUS_LABELS, changes.status.to)}`;
                if (changed("outcome")) return `Outcome: ${label(LETTER_TYPE_LABELS, changes.outcome.from)} → ${label(LETTER_TYPE_LABELS, changes.outcome.to)}`;
                if (changed("assignedOfficerId")) return changes.assignedOfficerId.to ? "Officer assigned" : "Officer removed";
                return action === "delete" ? "Application deleted" : "Application updated";
            case "student":
                return action === "create" ? "Student added" : "Student details updated";
            case "applicationDocument":
                return `${action === "delete" ? "Document removed" : "Document uploaded"}: ${entityLabel}`;
            case "manualReview":
                if (action === "create") return "Sent to manual review";
                if (changed("resolution") && changes.resolution.to) return `Review resolved: ${label(REVIEW_RESOLUTION_LABELS, changes.resolution.to)}`;
                if (changed("reviewerId") && changes.reviewerId.to) return "Reviewer assigned";
                if (changed("status")) return `Review: ${label(REVIEW_STATUS_LABELS, changes.status.to)}`;
                return "Review case updated";
            case "applicationDocumentRequest":
                return "Documents requested from the student";
            case "applicationNote":
                return "Note added";
            case "email": {
                const state = {sent: "Email sent", failed: "Email failed", retrying: "Email failed; it will be retried"}[action] ?? "Email sending";
                return `${state}: ${entityLabel}`;
            }
            case "applicationLetter":
                if (action === "create") return `Letter generated: ${entityLabel}`;
                if (changed("status")) return `Letter ${label(LETTER_STATUS_LABELS, changes.status.to).toLowerCase()}: ${entityLabel}`;
                return `Letter updated: ${entityLabel}`;
            case "assessmentCriterion":
                return changes.overrideResult?.to ? `Criterion result overridden: ${entityLabel}` : `Criterion override removed: ${entityLabel}`;
            default:
                return `${entityType} ${action}`;
        }
    },
};

export default applicationActivityService;
