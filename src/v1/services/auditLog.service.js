import _ from "lodash";
import dbHelper from "../helpers/db.helper.js";
import responseHelper from "../helpers/response.helper.js";
import {ROLES} from "../constants/role.constants.js";
import {AUDIT_ACTION_LABELS, AUDITED_MODULES, USER_ID_FIELDS} from "../constants/audit.constants.js";

const AUDIT_LOG_SELECT = `
    SELECT a.id, a.module, a.action, a.entity_type AS entityType, a.entity_id AS entityId, a.entity_label AS entityLabel,
           a.changes, a.user_id AS userId, a.user_name AS userName, a.ip_address AS ipAddress,
           a.request_id AS requestId, a.created_at AS createdAt
    FROM audit_logs a`;

// Logs are written by helpers/audit.helper.js; this only reads them, inside the user's tenant
const auditLogService = {
    // Newest first. The Super Admin sees every change in the tenant, everyone else only their own.
    list: async ({page, limit, ...filters}, currentUser) => {
        const {module, action, entityType, entityId, userId, from, to, search} = filters;
        const conditions = ["a.tenant_id = :tenantId", "a.deleted_at IS NULL"];
        if (currentUser.role !== ROLES.SUPER_ADMIN) conditions.push("a.user_id = :currentUserId");
        if (module) conditions.push("a.module = :module");
        if (action) conditions.push("a.action = :action");
        if (entityType) conditions.push("a.entity_type = :entityType");
        if (entityId) conditions.push("a.entity_id = :entityId");
        if (userId) conditions.push("a.user_id = :userId");
        if (from) conditions.push("a.created_at >= :from");
        if (to) conditions.push("a.created_at < DATE_ADD(:to, INTERVAL 1 DAY)");
        if (search) conditions.push("(a.entity_label LIKE :search OR a.user_name LIKE :search)");

        const where = `WHERE ${conditions.join(" AND ")}`;
        const result = await dbHelper.paginate({
            countSql: `SELECT COUNT(*) AS total FROM audit_logs a ${where}`,
            // created_at first, so the (tenant_id, created_at) index serves the order
            rowsSql: `${AUDIT_LOG_SELECT} ${where} ORDER BY a.created_at DESC, a.id DESC LIMIT :limit OFFSET :offset`,
            replacements: {...filters, tenantId: currentUser.tenantId, currentUserId: currentUser.id, search: search && dbHelper.likePattern(search)},
            page,
            limit,
        });
        return {...result, items: await auditLogService.withUserNames(result.items, "changes", currentUser.tenantId)};
    },

    /**
     * Changes refer to users by id (reviewerId: 5); this adds their names next to the ids, read in one query:
     * {from: 5, to: 7} -> {from: 5, to: 7, fromName: "Riya", toName: "Arjun"}. field is where the changes are.
     */
    withUserNames: async (items, field, tenantId) => {
        const userChanges = (item) => _.pick(_.isPlainObject(item[field]) ? item[field] : {}, USER_ID_FIELDS);
        const ids = _.uniq(items.flatMap((item) => _.flatMap(userChanges(item), (change) => [change?.from, change?.to]))).filter(Number.isInteger);
        if (!ids.length) return items;
        // Deleted users too: an old change still names who it was
        const users = await dbHelper.select("SELECT id, name FROM users WHERE id IN (:ids) AND tenant_id = :tenantId", {ids, tenantId});
        const nameOf = (id) => _.find(users, {id})?.name ?? null;
        return items.map((item) => {
            const changes = userChanges(item);
            if (_.isEmpty(changes)) return item;
            const named = _.mapValues(changes, (change) => ({...change, fromName: nameOf(change.from), toName: nameOf(change.to)}));
            return {...item, [field]: {...item[field], ...named}};
        });
    },

    // For the module and action filter dropdowns
    options: async () => ({
        modules: await dbHelper.select(
            "SELECT code, name FROM modules WHERE code IN (:codes) AND deleted_at IS NULL ORDER BY sort_order, name",
            {codes: AUDITED_MODULES}
        ),
        actions: responseHelper.labelOptions(AUDIT_ACTION_LABELS),
    }),
};

export default auditLogService;
