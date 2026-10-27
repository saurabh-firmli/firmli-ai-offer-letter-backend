import _ from "lodash";
import databaseModel from "../utils/database.util.js";
import {ApiError} from "../utils/ApiError.js";
import {HTTP_RESPONSES} from "../constants/http-response-messages.constants.js";
import {MODULES} from "../constants/module.constants.js";
import {ROLES} from "../constants/role.constants.js";
import {TENANT_STATUS_LABELS, TENANT_STATUSES} from "../constants/tenant.constants.js";
import {ERROR_CODES} from "../constants/error-codes.constants.js";
import dbHelper from "../helpers/db.helper.js";
import responseHelper from "../helpers/response.helper.js";
import auditHelper from "../helpers/audit.helper.js";
import authService from "./auth.service.js";
import roleService from "./role.service.js";
import settingsService from "./settings.service.js";
import userService from "./user.service.js";

const NOT_FOUND = "Tenant not found";
const EMAIL_TAKEN = "Email is already registered";
const CODE_TAKEN = "Institution code already exists";
const PLATFORM_LOCKED = "The platform tenant cannot be blocked or removed";

const TENANT_SELECT = `
    SELECT t.id, t.name, t.code, t.contact_email AS contactEmail, t.status, t.is_platform AS isPlatform, t.created_at AS createdAt,
           (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.deleted_at IS NULL) AS userCount,
           (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.status = 'active' AND u.deleted_at IS NULL) AS activeUserCount,
           (SELECT COUNT(*) FROM applications a WHERE a.tenant_id = t.id AND a.deleted_at IS NULL) AS applicationCount,
           (SELECT MAX(u.last_login_at) FROM users u WHERE u.tenant_id = t.id AND u.deleted_at IS NULL) AS lastLoginAt
    FROM tenants t
    WHERE t.deleted_at IS NULL`;

/**
 * The Platform admin panel for Firmli staff (users of a platform tenant): every client tenant, with
 * its users. Create a tenant with its first Super Admin, add users to it, block / unblock or remove it.
 * Each change is in that tenant's audit log, by the staff member who made it.
 */
const platformService = {
    options: async () => ({
        statuses: responseHelper.labelOptions(TENANT_STATUS_LABELS),
        roles: await dbHelper.select("SELECT id, code, name FROM roles WHERE deleted_at IS NULL ORDER BY sort_order, name"),
    }),

    // Platform tenant first, then by name
    list: async ({page, limit, status, search}) => {
        const conditions = [];
        if (status) conditions.push("t.status = :status");
        if (search) conditions.push("(t.name LIKE :search OR t.code LIKE :search OR t.contact_email LIKE :search)");
        const where = conditions.length ? ` AND ${conditions.join(" AND ")}` : "";
        const replacements = {status, search: search && dbHelper.likePattern(search)};

        const [{total}, rows, statusCounts] = await Promise.all([
            dbHelper.selectOne(`SELECT COUNT(*) AS total FROM tenants t WHERE t.deleted_at IS NULL${where}`, replacements),
            dbHelper.select(`${TENANT_SELECT}${where} ORDER BY t.is_platform DESC, t.name LIMIT :limit OFFSET :offset`, {
                ...replacements,
                limit,
                offset: (page - 1) * limit,
            }),
            dbHelper.select("SELECT status, COUNT(*) AS count FROM tenants WHERE deleted_at IS NULL GROUP BY status"),
        ]);
        return {items: rows.map(platformService.toResponse), total, page, limit, counts: dbHelper.countsBy(statusCounts, TENANT_STATUS_LABELS)};
    },

    // One tenant with its users
    getById: async (id) => {
        const tenant = await dbHelper.selectOneOrFail(`${TENANT_SELECT} AND t.id = :id`, {id}, NOT_FOUND);
        const users = await dbHelper.select(
            `SELECT u.id, u.name, u.email, r.id AS roleId, r.code AS role, r.name AS roleName, u.status, u.last_login_at AS lastLoginAt,
                    u.created_at AS createdAt
             FROM users u JOIN roles r ON r.id = u.role_id
             WHERE u.tenant_id = :id AND u.deleted_at IS NULL ORDER BY r.sort_order, u.name`,
            {id}
        );
        return {...platformService.toResponse(tenant), users};
    },

    /**
     * A new client: the tenant, its default settings and its first Super Admin (inactive until they
     * log in), in one transaction. Also used by `npm run create-tenant`.
     */
    create: async ({name, code, contactEmail, admin}) => {
        await platformService.assertFree({code, email: admin.email});
        const adminRole = await dbHelper.selectOne("SELECT id FROM roles WHERE code = :code AND deleted_at IS NULL", {code: ROLES.SUPER_ADMIN});
        const passwordHash = await authService.hashPassword(admin.password);

        const tenantId = await databaseModel.sequelize.transaction(async (transaction) => {
            const tenant = await databaseModel.tenant.create({name, code: code || null, contactEmail: contactEmail || null}, {transaction});
            await settingsService.createDefaults(tenant.id, transaction);
            await databaseModel.user.create(
                {tenantId: tenant.id, name: admin.name, email: admin.email, passwordHash, roleId: adminRole.id},
                {transaction}
            );
            await platformService.log(tenant, "create", {name: {from: null, to: name}, code: {from: null, to: code || null}}, transaction);
            return tenant.id;
        });
        return platformService.getById(tenantId);
    },

    // Rename, code, contact email, or block / unblock
    update: async (id, values) => {
        const tenant = await platformService.findLive(id);
        if (values.status && values.status !== tenant.status && tenant.isPlatform) throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, PLATFORM_LOCKED);
        if (values.code && values.code !== tenant.code) await platformService.assertFree({code: values.code});

        const columns = dbHelper.emptyToNull(values);
        const changes = _.pickBy(
            _.mapValues(columns, (to, field) => ({from: tenant[field] ?? null, to})),
            (change) => change.from !== change.to
        );
        if (!_.isEmpty(changes)) {
            await databaseModel.sequelize.transaction(async (transaction) => {
                await dbHelper.saveOrConflict(() => databaseModel.tenant.update(columns, {where: {id}, transaction}), CODE_TAKEN);
                await platformService.log(tenant, "update", changes, transaction);
            });
        }
        return platformService.getById(id);
    },

    // Removes the tenant and its users (soft delete: the data stays; their emails and the code are free again)
    remove: async (id) => {
        const tenant = await platformService.findLive(id);
        if (tenant.isPlatform) throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, PLATFORM_LOCKED);
        await databaseModel.sequelize.transaction(async (transaction) => {
            await databaseModel.user.destroy({where: {tenantId: id}, transaction});
            await databaseModel.tenant.destroy({where: {id}, transaction});
            await platformService.log(tenant, "delete", {name: {from: tenant.name, to: null}}, transaction);
        });
    },

    // A user in that tenant, with any role (a Super Admin too); inactive until they log in, unless status says otherwise
    addUser: async (tenantId, {password, ...values}) => {
        await platformService.findLive(tenantId);
        await roleService.assertExists(values.roleId);
        await platformService.assertFree({email: values.email});
        const user = await dbHelper.saveOrConflict(
            async () => databaseModel.user.create({...values, tenantId, passwordHash: await authService.hashPassword(password)}),
            EMAIL_TAKEN
        );
        return _.find((await platformService.getById(tenantId)).users, {id: user.id});
    },

    // "Send by Email" for a user of any tenant (e.g. the first Super Admin of a new one): their login details,
    // from that institution, as the tenant's own Users page sends them
    sendCredentials: async (tenantId, userId, password) => {
        const tenant = await platformService.findLive(tenantId);
        if (tenant.status === TENANT_STATUSES.BLOCKED) {
            throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, "This institution is blocked; unblock it first", ERROR_CODES.TENANT_BLOCKED);
        }
        return userService.emailCredentials(await userService.getById(userId, tenantId), password, tenantId);
    },

    findLive: (id) =>
        dbHelper.selectOneOrFail(
            "SELECT id, name, code, contact_email AS contactEmail, status, is_platform AS isPlatform FROM tenants WHERE id = :id AND deleted_at IS NULL",
            {id},
            NOT_FOUND
        ),

    // 409 for a code or email already in use (users' emails are unique across all tenants)
    assertFree: async ({code, email}) => {
        if (code && (await dbHelper.selectOne("SELECT id FROM tenants WHERE code = :code AND deleted_at IS NULL", {code}))) {
            throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, CODE_TAKEN);
        }
        if (email && (await dbHelper.selectOne("SELECT id FROM users WHERE email = :email AND deleted_at IS NULL", {email}))) {
            throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, EMAIL_TAKEN);
        }
    },

    // In the tenant's own audit log (Settings module), by the staff member
    log: (tenant, action, changes, transaction) =>
        auditHelper.write(
            {tenantId: tenant.id, module: MODULES.SETTINGS, entityType: "tenant", entityId: tenant.id, entityLabel: tenant.name, action, changes},
            transaction
        ),

    toResponse: (row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        contactEmail: row.contactEmail,
        status: row.status,
        isPlatform: Boolean(row.isPlatform),
        userCount: row.userCount,
        activeUserCount: row.activeUserCount,
        applicationCount: row.applicationCount,
        lastLoginAt: row.lastLoginAt,
        createdAt: row.createdAt,
    }),
};

export default platformService;
