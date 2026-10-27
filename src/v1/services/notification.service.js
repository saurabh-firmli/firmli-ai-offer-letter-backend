import _ from "lodash";
import {MODULES} from "../constants/module.constants.js";
import dbHelper from "../helpers/db.helper.js";

/**
 * The topbar bell: what needs the user's attention, as counts. Each item is shown only to roles that
 * may see its module, so the total never counts something the user cannot open.
 */
const NOTIFICATIONS = [
    {
        code: "reviews_unassigned",
        label: "Manual reviews waiting for a reviewer",
        module: MODULES.REVIEWS,
        action: "read",
        sql: "SELECT COUNT(*) AS count FROM manual_reviews WHERE tenant_id = :tenantId AND status = 'unassigned' AND deleted_at IS NULL",
    },
    {
        code: "reviews_assigned_to_me",
        label: "Manual reviews assigned to you",
        module: MODULES.REVIEWS,
        action: "update",
        sql: `SELECT COUNT(*) AS count FROM manual_reviews
              WHERE tenant_id = :tenantId AND reviewer_id = :userId AND status IN ('assigned', 'in_review') AND deleted_at IS NULL`,
    },
    {
        code: "letters_waiting",
        label: "Letters waiting for approval",
        module: MODULES.LETTERS,
        action: "update",
        sql: "SELECT COUNT(*) AS count FROM application_letters WHERE tenant_id = :tenantId AND status = 'pending_approval' AND deleted_at IS NULL",
    },
    {
        code: "emails_failed",
        label: "Emails to students that failed",
        module: MODULES.COMMUNICATIONS,
        action: "update",
        sql: "SELECT COUNT(*) AS count FROM application_emails WHERE tenant_id = :tenantId AND status = 'failed' AND deleted_at IS NULL",
    },
    {
        code: "assessments_failed",
        label: "Assessments that failed",
        module: MODULES.APPLICATIONS,
        action: "read",
        sql: "SELECT COUNT(*) AS count FROM applications WHERE tenant_id = :tenantId AND assessment_status = 'failed' AND deleted_at IS NULL",
    },
    {
        code: "assessments_pending",
        label: "Submitted applications not assessed yet",
        module: MODULES.APPLICATIONS,
        action: "read",
        sql: `SELECT COUNT(*) AS count FROM applications
              WHERE tenant_id = :tenantId AND status = 'submitted' AND assessment_status = 'pending' AND deleted_at IS NULL`,
    },
];

const notificationService = {
    // {total, items: [{code, label, count}]}: the items the user may see, zeros included
    get: async (user) => {
        const visible = NOTIFICATIONS.filter((item) => user.permissions[item.module]?.[item.action]);
        const counts = await Promise.all(
            visible.map((item) => dbHelper.selectOne(item.sql, {tenantId: user.tenantId, userId: user.id}))
        );
        const items = visible.map((item, index) => ({code: item.code, label: item.label, count: counts[index].count}));
        return {total: _.sumBy(items, "count"), items};
    },
};

export default notificationService;
