import _ from "lodash";
import {APPLICATION_STATUS_LABELS} from "../constants/application.constants.js";
import {LETTER_TYPE_LABELS} from "../constants/letter-template.constants.js";
import dbHelper from "../helpers/db.helper.js";
import dateHelper from "../helpers/date.helper.js";

const DEFAULT_TREND_DAYS = 30;
const LIST_SIZE = 5;
const ATTENTION_SIZE = 10;
const ACTIVITY_SIZE = 10;

// Times are shifted by the viewer's UTC offset, so "today" and the trend days are their own days
const LOCAL = dateHelper.localSql;
const IN_PERIOD = dateHelper.inPeriodSql;
export const SUBMITTED_IN_PERIOD = `a.status <> 'draft' AND ${IN_PERIOD("a.submitted_at")}`;

// A submitted application whose locked criteria version requires a document type it has no file for
export const MISSING_DOCUMENTS = `EXISTS (
    SELECT 1 FROM eligibility_document_requirements r
    WHERE r.version_id = a.eligibility_version_id AND r.is_required = 1 AND r.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM application_documents d
                      WHERE d.application_id = a.id AND d.document_type_id = r.document_type_id AND d.deleted_at IS NULL))`;

const NEEDS_ATTENTION = `(a.status = 'manual_review' OR a.assessment_status = 'failed' OR ${MISSING_DOCUMENTS})`;

const ATTENTION_REASONS = {
    manualReview: "Manual review needed",
    assessmentFailed: "Assessment failed",
    missingDocuments: "Required documents missing",
};

const ACTIVITY_LABELS = {
    created: "Application created",
    submitted: "Application submitted",
    document_uploaded: "Document uploaded",
};

/**
 * The admissions dashboard of one tenant in one call. Counts cover applications submitted in the
 * period (drafts by creation date); "today" ignores the period. Optional programId narrows everything.
 */
const dashboardService = {
    get: async ({from, to, programId, utcOffset}, tenantId) => {
        const today = dateHelper.localDate(new Date(), utcOffset);
        const {start: trendFrom, end: trendTo} = dateHelper.chartRange({from, to, utcOffset}, DEFAULT_TREND_DAYS);

        const scope = dashboardService.scope(programId);
        const replacements = {tenantId, programId, utcOffset, from: from ?? null, to: to ?? null, today, trendFrom, trendTo};

        const [counts, avgProcessingSeconds, statuses, outcomes, programs, trend, recentApplications, attention, activity] = await Promise.all([
            dashboardService.counts(scope, replacements),
            dashboardService.avgProcessingSeconds(scope, replacements),
            dashboardService.groupCount("a.status", `(a.status = 'draft' AND ${IN_PERIOD("a.created_at")}) OR (${SUBMITTED_IN_PERIOD})`, scope, replacements),
            dashboardService.groupCount("a.outcome", `a.outcome IS NOT NULL AND ${SUBMITTED_IN_PERIOD}`, scope, replacements),
            dashboardService.programs(scope, replacements),
            dashboardService.trend(scope, replacements),
            dashboardService.recentApplications(scope, replacements),
            dashboardService.attention(scope, replacements),
            dashboardService.activity(scope, replacements),
        ]);

        const rate = (count) => (counts.assessed ? _.round(count / counts.assessed, 4) : null);
        return {
            period: {from: from ?? null, to: to ?? null, utcOffset},
            stats: {
                ..._.omit(counts, "assessed"),
                avgProcessingSeconds,
            },
            rates: {
                assessed: counts.assessed,
                offer: rate(counts.conditionalOffers),
                rejection: rate(counts.rejections),
                manualReview: rate(counts.manualReview),
            },
            statuses: _.map(APPLICATION_STATUS_LABELS, (label, value) => ({value, label, count: statuses[value] ?? 0})),
            outcomes: _.map(LETTER_TYPE_LABELS, (label, value) => ({value, label, count: outcomes[value] ?? 0})),
            programs,
            trend: dateHelper.fillDays(trend, trendFrom, trendTo, (date) => ({date, count: 0})),
            recentApplications,
            attention,
            activity,
        };
    },

    // SQL: the tenant's applications (alias a), optionally of one program
    scope: (programId) => `a.tenant_id = :tenantId AND a.deleted_at IS NULL${programId ? " AND a.program_id = :programId" : ""}`,

    counts: async (scope, replacements) => {
        const row = await dbHelper.selectOne(
            `SELECT
                COALESCE(SUM(${SUBMITTED_IN_PERIOD}), 0) AS totalApplications,
                COALESCE(SUM(a.status = 'draft' AND ${IN_PERIOD("a.created_at")}), 0) AS drafts,
                COALESCE(SUM(a.status <> 'draft' AND DATE(${LOCAL("a.submitted_at")}) = :today), 0) AS receivedToday,
                COALESCE(SUM(${SUBMITTED_IN_PERIOD} AND a.assessment_status IN ('pending', 'in_progress')), 0) AS pendingAssessments,
                COALESCE(SUM(${SUBMITTED_IN_PERIOD} AND a.outcome = 'conditional_offer'), 0) AS conditionalOffers,
                COALESCE(SUM(${SUBMITTED_IN_PERIOD} AND a.outcome = 'rejection'), 0) AS rejections,
                COALESCE(SUM(${SUBMITTED_IN_PERIOD} AND a.outcome = 'manual_review'), 0) AS manualReview,
                COALESCE(SUM(${SUBMITTED_IN_PERIOD} AND a.outcome IS NOT NULL), 0) AS assessed,
                COALESCE(SUM(${SUBMITTED_IN_PERIOD} AND ${MISSING_DOCUMENTS}), 0) AS missingDocuments,
                COALESCE(SUM(${SUBMITTED_IN_PERIOD} AND a.assigned_officer_id IS NULL), 0) AS unassigned,
                COALESCE(SUM(${SUBMITTED_IN_PERIOD} AND EXISTS (
                    SELECT 1 FROM application_letters l WHERE l.application_id = a.id AND l.status = 'pending_approval' AND l.deleted_at IS NULL)), 0) AS lettersWaiting,
                COALESCE(SUM(IF(${SUBMITTED_IN_PERIOD}, (
                    SELECT COUNT(*) FROM application_emails e WHERE e.application_id = a.id AND e.status = 'sent' AND e.deleted_at IS NULL), 0)), 0) AS emailsSent,
                COALESCE(SUM(IF(${SUBMITTED_IN_PERIOD}, (
                    SELECT COUNT(*) FROM application_emails e WHERE e.application_id = a.id AND e.status = 'failed' AND e.deleted_at IS NULL), 0)), 0) AS failedEmails
             FROM applications a WHERE ${scope}`,
            replacements
        );
        return row;
    },

    // How long a completed AI assessment run takes, on average (seconds), for the applications in the period; null without runs
    avgProcessingSeconds: async (scope, replacements) => {
        const {seconds} = await dbHelper.selectOne(
            `SELECT AVG(TIMESTAMPDIFF(SECOND, x.started_at, x.completed_at)) AS seconds
             FROM application_assessments x JOIN applications a ON a.id = x.application_id
             WHERE ${scope} AND ${SUBMITTED_IN_PERIOD} AND x.status = 'completed' AND x.deleted_at IS NULL`,
            replacements
        );
        return seconds === null ? null : Math.round(seconds);
    },

    // {value: count} for one column
    groupCount: async (column, condition, scope, replacements) => {
        const rows = await dbHelper.select(
            `SELECT ${column} AS value, COUNT(*) AS count FROM applications a WHERE ${scope} AND (${condition}) GROUP BY ${column}`,
            replacements
        );
        return _.mapValues(_.keyBy(rows, "value"), "count");
    },

    programs: (scope, replacements) =>
        dbHelper.select(
            `SELECT p.id, p.name, p.code, COUNT(*) AS count
             FROM applications a JOIN programs p ON p.id = a.program_id
             WHERE ${scope} AND ${SUBMITTED_IN_PERIOD}
             GROUP BY p.id, p.name, p.code ORDER BY count DESC, p.name LIMIT 10`,
            replacements
        ),

    trend: (scope, replacements) =>
        dbHelper.select(
            `SELECT DATE_FORMAT(${LOCAL("a.submitted_at")}, '%Y-%m-%d') AS date, COUNT(*) AS count
             FROM applications a
             WHERE ${scope} AND a.status <> 'draft' AND ${dateHelper.inRangeSql("a.submitted_at", "trendFrom", "trendTo")}
             GROUP BY date`,
            replacements
        ),

    recentApplications: (scope, replacements) =>
        dbHelper.select(
            `SELECT a.id, a.application_number AS applicationNumber, CONCAT_WS(' ', s.first_name, s.last_name) AS studentName,
                    p.name AS programName, a.status, a.assessment_status AS assessmentStatus, a.outcome, a.submitted_at AS submittedAt
             FROM applications a JOIN students s ON s.id = a.student_id JOIN programs p ON p.id = a.program_id
             WHERE ${scope} AND a.status <> 'draft'
             ORDER BY a.submitted_at DESC, a.id DESC LIMIT ${LIST_SIZE}`,
            replacements
        ),

    // Oldest waiting first, each with why it needs action
    attention: async (scope, replacements) => {
        const [{total}, rows] = await Promise.all([
            dbHelper.selectOne(`SELECT COUNT(*) AS total FROM applications a WHERE ${scope} AND a.status <> 'draft' AND ${NEEDS_ATTENTION}`, replacements),
            dbHelper.select(
                `SELECT a.id, a.application_number AS applicationNumber, CONCAT_WS(' ', s.first_name, s.last_name) AS studentName,
                        p.name AS programName, a.status, a.assessment_status AS assessmentStatus, a.submitted_at AS since,
                        ${MISSING_DOCUMENTS} AS missingDocuments
                 FROM applications a JOIN students s ON s.id = a.student_id JOIN programs p ON p.id = a.program_id
                 WHERE ${scope} AND a.status <> 'draft' AND ${NEEDS_ATTENTION}
                 ORDER BY a.submitted_at, a.id LIMIT ${ATTENTION_SIZE}`,
                replacements
            ),
        ]);
        const items = rows.map(({status, assessmentStatus, missingDocuments, ...row}) => ({
            ...row,
            reasons: _.compact([
                status === "manual_review" && "manualReview",
                assessmentStatus === "failed" && "assessmentFailed",
                missingDocuments && "missingDocuments",
            ]).map((code) => ({code, label: ATTENTION_REASONS[code]})),
        }));
        return {total, items};
    },

    // The latest events across the tenant's applications, newest first. Each kind is cut to the newest few
    // first, so only those are merged and sorted
    activity: async (scope, replacements) => {
        const rows = await dbHelper.select(
            `(SELECT 'created' AS type, a.id AS applicationId, a.application_number AS applicationNumber, NULL AS userName, a.created_at AS at
              FROM applications a WHERE ${scope} ORDER BY a.created_at DESC LIMIT ${ACTIVITY_SIZE})
             UNION ALL
             (SELECT 'submitted', a.id, a.application_number, u.name, a.submitted_at
              FROM applications a LEFT JOIN users u ON u.id = a.submitted_by WHERE ${scope} AND a.submitted_at IS NOT NULL
              ORDER BY a.submitted_at DESC LIMIT ${ACTIVITY_SIZE})
             UNION ALL
             (SELECT 'document_uploaded', a.id, a.application_number, u.name, d.created_at
              FROM application_documents d JOIN applications a ON a.id = d.application_id LEFT JOIN users u ON u.id = d.uploaded_by
              WHERE ${scope} AND d.deleted_at IS NULL ORDER BY d.created_at DESC LIMIT ${ACTIVITY_SIZE})
             ORDER BY at DESC LIMIT ${ACTIVITY_SIZE}`,
            replacements
        );
        return rows.map((row) => ({...row, label: ACTIVITY_LABELS[row.type]}));
    },
};

export default dashboardService;
