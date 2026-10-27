import _ from "lodash";
import databaseModel from "../utils/database.util.js";
import {ApiError} from "../utils/ApiError.js";
import {HTTP_RESPONSES} from "../constants/http-response-messages.constants.js";
import {ACTIONS_BY_MODULE, MODULES, PERMISSION_ACTIONS} from "../constants/module.constants.js";
import {ROLES} from "../constants/role.constants.js";
import dbHelper from "../helpers/db.helper.js";
import auditHelper from "../helpers/audit.helper.js";

const NOT_FOUND = "Role not found";
const COLUMN_BY_ACTION = {create: "canCreate", read: "canRead", update: "canUpdate", delete: "canDelete"};

// Every role x module, with the tenant's own permission where it has one, else the default
const PERMISSION_SELECT = `
    SELECT r.id AS roleId, m.code AS module,
           COALESCE(t.can_create, d.can_create, 0) AS canCreate, COALESCE(t.can_read, d.can_read, 0) AS canRead,
           COALESCE(t.can_update, d.can_update, 0) AS canUpdate, COALESCE(t.can_delete, d.can_delete, 0) AS canDelete,
           t.id IS NOT NULL AS customized
    FROM roles r
    CROSS JOIN modules m
    LEFT JOIN role_module_permissions d ON d.role_id = r.id AND d.module_id = m.id AND d.deleted_at IS NULL
    LEFT JOIN tenant_role_permissions t
           ON t.role_id = r.id AND t.module_id = m.id AND t.tenant_id = :tenantId AND t.deleted_at IS NULL
    WHERE r.deleted_at IS NULL AND m.deleted_at IS NULL`;

/**
 * Roles are the same for every tenant. Their permissions start from the defaults in
 * role_module_permissions, and a tenant's Super Admin may change them for that tenant only
 * (tenant_role_permissions). The Super Admin role itself is never changed, so nobody locks the tenant out.
 */
const roleService = {
    // Every role with its permissions and its number of users in this tenant, plus the modules, for the role / module grid
    list: async (tenantId) => {
        const [roles, modules, rows, userCounts] = await Promise.all([
            dbHelper.select("SELECT id, code, name, description FROM roles WHERE deleted_at IS NULL ORDER BY sort_order, name"),
            roleService.modules(),
            dbHelper.select(PERMISSION_SELECT, {tenantId}),
            dbHelper.select("SELECT role_id AS roleId, COUNT(*) AS count FROM users WHERE tenant_id = :tenantId AND deleted_at IS NULL GROUP BY role_id", {tenantId}),
        ]);
        const rowsByRole = _.groupBy(rows, "roleId");
        const userCountByRole = _.mapValues(_.keyBy(userCounts, "roleId"), "count");
        return {
            modules,
            roles: roles.map((role) => ({
                ...role,
                editable: role.code !== ROLES.SUPER_ADMIN,
                customized: _.some(rowsByRole[role.id], "customized"),
                userCount: userCountByRole[role.id] ?? 0,
                permissions: roleService.toPermissions(rowsByRole[role.id] ?? []),
            })),
        };
    },

    // Every module with the actions it has (Audit Logs only read, Settings read and update, ...)
    modules: async () =>
        (await dbHelper.select("SELECT code, name FROM modules WHERE deleted_at IS NULL ORDER BY sort_order, name")).map((module) => ({
            ...module,
            actions: roleService.actionsOf(module.code),
        })),

    // {programs: {create, read, update, delete}, ...}; a module the role may not use is left out
    permissionsOf: async (roleId, tenantId) =>
        roleService.toPermissions(await dbHelper.select(`${PERMISSION_SELECT} AND r.id = :roleId`, {roleId, tenantId})),

    /**
     * Changes what a role may do in this tenant. permissions = {module: {create, read, update, delete}};
     * modules not sent stay as they are. Logged as one audit entry: {"programs.delete": {from, to}}.
     */
    updatePermissions: async (roleId, permissions, currentUser) => {
        const {tenantId} = currentUser;
        const role = await roleService.findEditable(roleId);
        const modules = await dbHelper.select(
            "SELECT id, code, name FROM modules WHERE code IN (:codes) AND deleted_at IS NULL",
            {codes: Object.keys(permissions)}
        );
        roleService.assertValid(permissions, modules);

        const current = await roleService.permissionsOf(roleId, tenantId);
        const changed = modules.filter((module) => !_.isEqual(roleService.withAllActions(current[module.code]), permissions[module.code]));
        const changes = roleService.changesOf(current, _.pick(permissions, _.map(changed, "code")));
        roleService.assertMayGrant(role, changes, currentUser);
        if (changed.length) {
            await databaseModel.sequelize.transaction(async (transaction) => {
                for (const module of changed) {
                    await roleService.saveForTenant({tenantId, roleId, moduleId: module.id}, permissions[module.code], transaction);
                }
                await auditHelper.write(
                    {module: MODULES.ROLES, entityType: "role", entityId: role.id, entityLabel: role.name, action: "update", changes},
                    transaction
                );
            });
        }

        const {roles} = await roleService.list(tenantId);
        return _.find(roles, {id: role.id});
    },

    /**
     * Back to the defaults: the tenant's own permissions for this role are removed. Logged as one
     * audit entry with every permission that changes; nothing is logged when nothing was customized.
     */
    resetPermissions: async (roleId, currentUser) => {
        const {tenantId} = currentUser;
        const role = await roleService.findEditable(roleId);
        const current = await roleService.permissionsOf(roleId, tenantId);
        const defaults = await dbHelper.select(
            `SELECT m.code AS module, d.can_create AS canCreate, d.can_read AS canRead, d.can_update AS canUpdate, d.can_delete AS canDelete
             FROM role_module_permissions d JOIN modules m ON m.id = d.module_id AND m.deleted_at IS NULL
             WHERE d.role_id = :roleId AND d.deleted_at IS NULL`,
            {roleId}
        );
        const target = roleService.toPermissions(defaults);
        const codes = _.union(Object.keys(current), Object.keys(target));
        const changes = roleService.changesOf(current, _.zipObject(codes, codes.map((code) => roleService.withAllActions(target[code]))));
        roleService.assertMayGrant(role, changes, currentUser);

        await databaseModel.sequelize.transaction(async (transaction) => {
            await databaseModel.tenantRolePermission.destroy({where: {tenantId, roleId}, transaction});
            if (_.isEmpty(changes)) return;
            await auditHelper.write(
                {module: MODULES.ROLES, entityType: "role", entityId: role.id, entityLabel: role.name, action: "update", changes},
                transaction
            );
        });

        const {roles} = await roleService.list(tenantId);
        return _.find(roles, {id: role.id});
    },

    /**
     * A Super Admin may give any permission. Anyone else allowed to update roles may not change their own
     * role, and may turn on only what they may do themselves, so nobody can raise their own access.
     * changes: {"users.delete": {from, to}} as changesOf answers.
     */
    assertMayGrant: (role, changes, currentUser) => {
        if (currentUser.role === ROLES.SUPER_ADMIN) return;
        if (role.id === currentUser.roleId) throw ApiError.of(HTTP_RESPONSES.HTTP_FORBIDDEN, "You cannot change the permissions of your own role");
        const beyond = Object.keys(changes).filter((key) => changes[key].to && !_.get(currentUser.permissions, key));
        if (beyond.length) {
            throw ApiError.of(HTTP_RESPONSES.HTTP_FORBIDDEN, `You can only give permissions you have yourself: ${beyond.join(", ")}`);
        }
    },

    // Any role but Super Admin, whose permissions are never changed so nobody locks the tenant out
    findEditable: async (roleId) => {
        const role = await dbHelper.selectOneOrFail(
            "SELECT id, code, name FROM roles WHERE id = :roleId AND deleted_at IS NULL",
            {roleId},
            NOT_FOUND
        );
        if (role.code === ROLES.SUPER_ADMIN) {
            throw ApiError.of(HTTP_RESPONSES.HTTP_FORBIDDEN, "Super Admin permissions cannot be changed");
        }
        return role;
    },

    // The tenant's row for this role and module is updated, or created the first time
    saveForTenant: async (keys, actions, transaction) => {
        const values = _.mapKeys(actions, (allowed, action) => COLUMN_BY_ACTION[action]);
        const existing = await dbHelper.selectOne(
            `SELECT id FROM tenant_role_permissions
             WHERE tenant_id = :tenantId AND role_id = :roleId AND module_id = :moduleId AND deleted_at IS NULL`,
            keys,
            {transaction}
        );
        if (existing) await databaseModel.tenantRolePermission.update(values, {where: {id: existing.id}, transaction});
        else await databaseModel.tenantRolePermission.create({...keys, ...values}, {transaction});
    },

    // Unknown modules, actions a module does not have, and create / update / delete without read are refused
    assertValid: (permissions, modules) => {
        const errors = {};
        const moduleByCode = _.keyBy(modules, "code");
        for (const [code, actions] of Object.entries(permissions)) {
            const field = `permissions.${code}`;
            if (!moduleByCode[code]) {
                errors[field] = "Module not found";
                continue;
            }
            const notAvailable = PERMISSION_ACTIONS.filter((action) => actions[action] && !roleService.actionsOf(code).includes(action));
            if (notAvailable.length) errors[field] = `${moduleByCode[code].name} has no ${notAvailable.join(", ")}`;
            else if (!actions.read && (actions.create || actions.update || actions.delete)) {
                errors[field] = "Turn on read to allow create, update or delete";
            }
        }
        if (!_.isEmpty(errors)) throw ApiError.validation(errors);
    },

    // {"programs.delete": {from: true, to: false}, ...}
    changesOf: (current, permissions) => {
        const changes = {};
        for (const [code, actions] of Object.entries(permissions)) {
            const before = roleService.withAllActions(current[code]);
            for (const action of PERMISSION_ACTIONS) {
                if (before[action] !== actions[action]) changes[`${code}.${action}`] = {from: before[action], to: actions[action]};
            }
        }
        return changes;
    },

    // Throws 422 for a role id that does not exist; returns {id, code}
    assertExists: async (roleId) => {
        const role = await dbHelper.selectOne("SELECT id, code FROM roles WHERE id = :roleId AND deleted_at IS NULL", {roleId});
        if (!role) throw ApiError.validation({roleId: NOT_FOUND});
        return role;
    },

    actionsOf: (moduleCode) => ACTIONS_BY_MODULE[moduleCode] ?? PERMISSION_ACTIONS,

    // A module missing from a role's permissions has every action off
    withAllActions: (actions) => ({create: false, read: false, update: false, delete: false, ...actions}),

    toPermissions: (rows) =>
        Object.fromEntries(
            rows
                .filter((row) => row.canCreate || row.canRead || row.canUpdate || row.canDelete)
                .map((row) => [
                    row.module,
                    {create: Boolean(row.canCreate), read: Boolean(row.canRead), update: Boolean(row.canUpdate), delete: Boolean(row.canDelete)},
                ])
        ),
};

export default roleService;
