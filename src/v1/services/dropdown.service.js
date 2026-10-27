import dbHelper from "../helpers/db.helper.js";
import {LOGIN_STATUSES} from "../constants/user.constants.js";

/**
 * Dropdown options of the tenant's own records, always as [{value, label}] sorted by label, so every
 * select box reads them the same way. Each list keeps to what a dropdown needs (no pagination).
 */
const dropdownService = {
    /**
     * The tenant's programs: "MSc Data Science (MSDS)"; optionally one status (e.g. active for a new application).
     * withEligibilitySet adds the set each program uses now, eligibilitySet: {id, name} or null (Assign Programs)
     */
    programs: async ({status, search, withEligibilitySet}, tenantId) => {
        const conditions = ["p.tenant_id = :tenantId", "p.deleted_at IS NULL"];
        if (status) conditions.push("p.status = :status");
        if (search) conditions.push("(p.name LIKE :search OR p.code LIKE :search)");
        const rows = await dbHelper.select(
            `SELECT p.id AS value, CONCAT(p.name, ' (', p.code, ')') AS label, es.id AS setId, es.name AS setName
             FROM programs p LEFT JOIN eligibility_sets es ON es.id = p.eligibility_set_id AND es.deleted_at IS NULL
             WHERE ${conditions.join(" AND ")} ORDER BY p.name, p.code`,
            {tenantId, status, search: search && dbHelper.likePattern(search)}
        );
        return rows.map(({setId, setName, ...option}) =>
            withEligibilitySet ? {...option, eligibilitySet: setId ? {id: setId, name: setName} : null} : option
        );
    },

    // The tenant's campuses: "Main Campus (Pune)"; the city tells apart two campuses of the same name
    campuses: ({search}, tenantId) =>
        dbHelper.select(
            `SELECT c.id AS value, IF(ci.name IS NULL, c.name, CONCAT(c.name, ' (', ci.name, ')')) AS label
             FROM campuses c LEFT JOIN cities ci ON ci.id = c.city_id
             WHERE c.tenant_id = :tenantId AND c.deleted_at IS NULL ${search ? "AND c.name LIKE :search" : ""}
             ORDER BY label, c.id`,
            {tenantId, search: search && dbHelper.likePattern(search)}
        ),

    // The tenant's eligibility sets by name; published: only those with a published version (a program needs one)
    eligibilitySets: ({published, search}, tenantId) => {
        const conditions = ["s.tenant_id = :tenantId", "s.deleted_at IS NULL"];
        if (published) {
            conditions.push("EXISTS (SELECT 1 FROM eligibility_set_versions v WHERE v.eligibility_set_id = s.id AND v.status = 'published' AND v.deleted_at IS NULL)");
        }
        if (search) conditions.push("s.name LIKE :search");
        return dbHelper.select(`SELECT s.id AS value, s.name AS label FROM eligibility_sets s WHERE ${conditions.join(" AND ")} ORDER BY s.name, s.id`, {
            tenantId,
            search: search && dbHelper.likePattern(search),
        });
    },

    // Letter templates by name, e.g. letterType=rejection for the program's Rejection Letter
    letterTemplates: ({letterType, status, search}, tenantId) =>
        dropdownService.templates("letter_templates", "letter_type", {type: letterType, status, search}, tenantId),

    // Email templates by name, e.g. emailType=conditional_offer for the program's Offer Email
    emailTemplates: ({emailType, status, search}, tenantId) =>
        dropdownService.templates("email_templates", "email_type", {type: emailType, status, search}, tenantId),

    /**
     * The tenant's users: "Riya Kapoor (Reviewer)", the role telling apart two people of the same name (no
     * email: any role may load this). role: one role code; assignable: only users who can log in, the ones
     * an application or a review case can be given to.
     */
    users: ({role, assignable, search}, tenantId) => {
        const conditions = ["u.tenant_id = :tenantId", "u.deleted_at IS NULL"];
        if (role) conditions.push("r.code = :role");
        if (assignable) conditions.push("u.status IN (:statuses)");
        if (search) conditions.push("u.name LIKE :search");
        return dbHelper.select(
            `SELECT u.id AS value, CONCAT(u.name, ' (', r.name, ')') AS label
             FROM users u JOIN roles r ON r.id = u.role_id
             WHERE ${conditions.join(" AND ")} ORDER BY u.name, u.id`,
            {tenantId, role, statuses: LOGIN_STATUSES, search: search && dbHelper.likePattern(search)}
        );
    },

    // The roles (the same for every tenant), in their order from Super Admin down, not by name. code lets a
    // form tell the Super Admin apart: only a Super Admin may give that role
    roles: () => dbHelper.select("SELECT id AS value, name AS label, code FROM roles WHERE deleted_at IS NULL ORDER BY sort_order, id"),

    // table and typeColumn are our own constants above, never user input
    templates: (table, typeColumn, {type, status, search}, tenantId) => {
        const conditions = ["tenant_id = :tenantId", "deleted_at IS NULL"];
        if (type) conditions.push(`${typeColumn} = :type`);
        if (status) conditions.push("status = :status");
        if (search) conditions.push("name LIKE :search");
        return dbHelper.select(`SELECT id AS value, name AS label FROM ${table} WHERE ${conditions.join(" AND ")} ORDER BY name, id`, {
            tenantId,
            type,
            status,
            search: search && dbHelper.likePattern(search),
        });
    },
};

export default dropdownService;
