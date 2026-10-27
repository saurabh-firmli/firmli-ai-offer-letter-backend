import _ from "lodash";
import {APPLICATION_STATUS_LABELS, ASSESSMENT_STATUS_LABELS, INTAKE_TERM_LABELS} from "../constants/application.constants.js";
import {LETTER_TYPE_LABELS} from "../constants/letter-template.constants.js";
import dbHelper from "../helpers/db.helper.js";
import dateHelper from "../helpers/date.helper.js";
import csvHelper from "../helpers/csv.helper.js";
import dashboardService, {MISSING_DOCUMENTS, SUBMITTED_IN_PERIOD} from "./dashboard.service.js";

const DEFAULT_CHART_DAYS = 30;
// The CSV streams EXPORT_BATCH rows at a time; MAX_EXPORT_ROWS keeps one download to a size a spreadsheet opens well
const MAX_EXPORT_ROWS = 50_000;
const EXPORT_BATCH = 1000;

const LOCAL = dateHelper.localSql;
const rate = (count, total) => (total ? _.round(count / total, 4) : null);

const EXPORT_COLUMNS = [
    {header: "Application number", value: (row) => row.applicationNumber},
    {header: "Student", value: (row) => row.studentName},
    {header: "Student email", value: (row) => row.studentEmail},
    {header: "Program code", value: (row) => row.programCode},
    {header: "Program", value: (row) => row.programName},
    {header: "Intake", value: (row) => `${INTAKE_TERM_LABELS[row.intakeTerm]} ${row.intakeYear}`},
    {header: "Application date", value: (row) => row.applicationDate},
    {header: "Submitted at (UTC)", value: (row) => row.submittedAt},
    {header: "Status", value: (row) => APPLICATION_STATUS_LABELS[row.status] ?? row.status},
    {header: "Assessment", value: (row) => ASSESSMENT_STATUS_LABELS[row.assessmentStatus] ?? row.assessmentStatus},
    {header: "Outcome", value: (row) => LETTER_TYPE_LABELS[row.outcome] ?? row.outcome},
    {header: "Confidence (%)", value: (row) => (_.isNil(row.confidence) ? null : Math.round(row.confidence * 100))},
    {header: "Decided by", value: (row) => ({ai: "AI", manual: row.decidedByName ?? "A person"})[row.decisionSource] ?? null},
    {header: "Decision reason", value: (row) => row.decisionReason},
    {header: "Missing documents", value: (row) => (row.missingDocuments ? "Yes" : "No")},
    {header: "Officer", value: (row) => row.officerName},
];

/**
 * The Reports page: KPIs, charts and a CSV of the applications submitted in a period (optionally
 * one program), in the viewer's days. Same period rules as the dashboard.
 */
const reportService = {
    get: async ({from, to, programId, utcOffset}, tenantId) => {
        const {start: chartFrom, end: chartTo} = dateHelper.chartRange({from, to, utcOffset}, DEFAULT_CHART_DAYS);
        const scope = dashboardService.scope(programId);
        const replacements = {tenantId, programId, utcOffset, from: from ?? null, to: to ?? null, chartFrom, chartTo};

        const [kpis, avgProcessingSeconds, overTime, programs, assessments] = await Promise.all([
            reportService.kpis(scope, replacements),
            dashboardService.avgProcessingSeconds(scope, replacements),
            reportService.overTime(scope, replacements),
            reportService.programs(scope, replacements),
            reportService.assessments(scope, replacements),
        ]);
        const fill = (rows, empty) => dateHelper.fillDays(rows, chartFrom, chartTo, (date) => ({date, ...empty}));
        const outcomeCounts = {conditional_offer: kpis.offers, rejection: kpis.rejections, manual_review: kpis.manualReview};

        return {
            period: {from: from ?? null, to: to ?? null, utcOffset},
            kpis: {
                totalApplications: kpis.total,
                conditionalOffers: kpis.offers,
                rejections: kpis.rejections,
                manualReviews: kpis.manualReview,
                inProgress: kpis.inProgress,
                assessmentCompletionRate: rate(kpis.assessed, kpis.total),
                avgConfidence: kpis.avgConfidence === null ? null : _.round(kpis.avgConfidence, 2),
                documentCompletionRate: rate(kpis.total - kpis.missingDocuments, kpis.total),
                avgProcessingSeconds,
                manualDecisions: kpis.manualDecisions,
                emailsSent: kpis.emailsSent,
            },
            charts: {
                overTime: fill(overTime, {submitted: 0, conditionalOffers: 0, rejections: 0, manualReviews: 0}),
                outcomes: _.map(LETTER_TYPE_LABELS, (label, value) => ({value, label, count: outcomeCounts[value]})),
                programs: programs.map((program) => ({...program, offerRate: rate(program.conditionalOffers, program.assessed)})),
                assessments: fill(assessments, {completed: 0, failed: 0, avgSeconds: null}),
            },
        };
    },

    // Rows for the CSV download, newest first
    /**
     * The CSV in pieces (header first, then EXPORT_BATCH rows at a time), so a big export never sits in
     * memory whole and other requests are served between batches. Batches follow the order
     * (submitted_at, id) newest first: each starts after the last row of the one before.
     *
     *   for await (const chunk of reportService.exportCsv(query, tenantId)) response.write(chunk);
     */
    exportCsv: async function* (query, tenantId) {
        // The first batch is read before anything is sent, so a failing query still answers a normal error
        let rows = await reportService.exportBatch(query, tenantId, null, EXPORT_BATCH);
        yield csvHelper.header(EXPORT_COLUMNS) + csvHelper.rows(EXPORT_COLUMNS, rows);
        let exported = rows.length;
        while (rows.length === EXPORT_BATCH && exported < MAX_EXPORT_ROWS) {
            const last = _.last(rows);
            rows = await reportService.exportBatch(query, tenantId, {submittedAt: last.cursorAt, id: last.id}, Math.min(EXPORT_BATCH, MAX_EXPORT_ROWS - exported));
            if (rows.length) yield csvHelper.rows(EXPORT_COLUMNS, rows);
            exported += rows.length;
        }
    },

    // One batch of export rows, after the row `after` ({submittedAt, id}) or from the newest
    exportBatch: ({from, to, programId, utcOffset}, tenantId, after, limit) =>
        dbHelper.select(
            // cursorAt: submitted_at as the database's own text, so the next batch compares it exactly (no Date / time zone round trip)
            `SELECT a.id, CAST(a.submitted_at AS CHAR) AS cursorAt,
                    a.application_number AS applicationNumber, CONCAT_WS(' ', s.first_name, s.middle_name, s.last_name) AS studentName,
                    s.email AS studentEmail, p.code AS programCode, p.name AS programName, a.intake_term AS intakeTerm, a.intake_year AS intakeYear,
                    DATE_FORMAT(a.application_date, '%Y-%m-%d') AS applicationDate, a.submitted_at AS submittedAt, a.status,
                    a.assessment_status AS assessmentStatus, a.outcome, a.confidence, a.decision_source AS decisionSource,
                    db.name AS decidedByName, a.decision_reason AS decisionReason, ${MISSING_DOCUMENTS} AS missingDocuments, o.name AS officerName
             FROM applications a
             JOIN students s ON s.id = a.student_id
             JOIN programs p ON p.id = a.program_id
             LEFT JOIN users db ON db.id = a.decided_by
             LEFT JOIN users o ON o.id = a.assigned_officer_id
             WHERE ${dashboardService.scope(programId)} AND ${SUBMITTED_IN_PERIOD}
               ${after ? "AND (a.submitted_at < :afterAt OR (a.submitted_at = :afterAt AND a.id < :afterId))" : ""}
             ORDER BY a.submitted_at DESC, a.id DESC LIMIT :limit`,
            {tenantId, programId, utcOffset, from: from ?? null, to: to ?? null, afterAt: after?.submittedAt, afterId: after?.id, limit}
        ),

    kpis: (scope, replacements) =>
        dbHelper.selectOne(
            `SELECT COUNT(*) AS total,
                    COALESCE(SUM(a.outcome = 'conditional_offer'), 0) AS offers,
                    COALESCE(SUM(a.outcome = 'rejection'), 0) AS rejections,
                    COALESCE(SUM(a.outcome = 'manual_review'), 0) AS manualReview,
                    COALESCE(SUM(a.outcome IS NOT NULL), 0) AS assessed,
                    COALESCE(SUM(a.status IN ('submitted', 'processing')), 0) AS inProgress,
                    COALESCE(SUM(a.decision_source = 'manual'), 0) AS manualDecisions,
                    COALESCE(SUM(${MISSING_DOCUMENTS}), 0) AS missingDocuments,
                    COALESCE(SUM((SELECT COUNT(*) FROM application_emails e WHERE e.application_id = a.id AND e.status = 'sent' AND e.deleted_at IS NULL)), 0) AS emailsSent,
                    AVG(a.confidence) AS avgConfidence
             FROM applications a WHERE ${scope} AND ${SUBMITTED_IN_PERIOD}`,
            replacements
        ),

    // Per day of submission, in the chart range
    overTime: (scope, replacements) =>
        dbHelper.select(
            `SELECT DATE_FORMAT(${LOCAL("a.submitted_at")}, '%Y-%m-%d') AS date, COUNT(*) AS submitted,
                    SUM(a.outcome = 'conditional_offer') AS conditionalOffers, SUM(a.outcome = 'rejection') AS rejections,
                    SUM(a.outcome = 'manual_review') AS manualReviews
             FROM applications a
             WHERE ${scope} AND a.status <> 'draft' AND ${dateHelper.inRangeSql("a.submitted_at", "chartFrom", "chartTo")}
             GROUP BY date`,
            replacements
        ),

    programs: (scope, replacements) =>
        dbHelper.select(
            `SELECT p.id, p.code, p.name, COUNT(*) AS total, SUM(a.outcome = 'conditional_offer') AS conditionalOffers,
                    SUM(a.outcome = 'rejection') AS rejections, SUM(a.outcome = 'manual_review') AS manualReviews,
                    SUM(a.outcome IS NOT NULL) AS assessed
             FROM applications a JOIN programs p ON p.id = a.program_id
             WHERE ${scope} AND ${SUBMITTED_IN_PERIOD}
             GROUP BY p.id, p.code, p.name ORDER BY total DESC, p.name`,
            replacements
        ),

    // AI assessment runs per day they started, in the chart range
    assessments: async (scope, replacements) =>
        (
            await dbHelper.select(
                `SELECT DATE_FORMAT(${LOCAL("x.started_at")}, '%Y-%m-%d') AS date,
                        SUM(x.status = 'completed') AS completed, SUM(x.status = 'failed') AS failed,
                        AVG(CASE WHEN x.status = 'completed' THEN TIMESTAMPDIFF(SECOND, x.started_at, x.completed_at) END) AS avgSeconds
                 FROM application_assessments x JOIN applications a ON a.id = x.application_id
                 WHERE ${scope} AND x.deleted_at IS NULL AND ${dateHelper.inRangeSql("x.started_at", "chartFrom", "chartTo")}
                 GROUP BY date`,
                replacements
            )
        ).map((row) => ({...row, avgSeconds: row.avgSeconds === null ? null : Math.round(row.avgSeconds)})),
};

export default reportService;
