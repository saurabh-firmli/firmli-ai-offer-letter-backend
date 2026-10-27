import databaseModel from "../utils/database.util.js";
import {ApiError} from "../utils/ApiError.js";
import {HTTP_RESPONSES} from "../constants/http-response-messages.constants.js";
import dbHelper from "../helpers/db.helper.js";
import authService from "./auth.service.js";
import roleService from "./role.service.js";
import sessionService, {END_REASONS} from "./session.service.js";
import emailHelper from "../helpers/email.helper.js";
import userEmails from "../emails/user.email.js";
import {ROLES} from "../constants/role.constants.js";
import {LOGIN_STATUSES, USER_STATUSES} from "../constants/user.constants.js";

const NOT_FOUND = "User not found";
const DUPLICATE_EMAIL = "Email is already registered";
const SUPER_ADMIN_ONLY = "Only a Super Admin can add, change or delete a Super Admin";
const MORE_ACCESS = "You can only add, change or delete users whose role has no more access than yours";

// password_hash is never selected here
const USER_SELECT = `
    SELECT u.id, u.tenant_id AS tenantId, u.name, u.email,
           u.role_id AS roleId, r.code AS role, r.name AS roleName,
           u.status, u.last_login_at AS lastLoginAt, u.created_at AS createdAt, u.updated_at AS updatedAt
    FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.deleted_at IS NULL`;

// Users who can log in (active, or inactive until their first login): those who can be given work
const ASSIGNABLE_USERS = `
    SELECT u.id, u.name, u.email, u.role_id AS roleId, r.name AS roleName
    FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.tenant_id = :tenantId AND u.status IN (:statuses) AND u.deleted_at IS NULL`;

// Users of the logged in user's tenant; currentUser is req.user
const userService = {
    list: ({status, search}, tenantId) => {
        const conditions = ["u.tenant_id = :tenantId"];
        if (status) conditions.push("u.status = :status");
        if (search) conditions.push("(u.name LIKE :search OR u.email LIKE :search)");
        return dbHelper.select(`${USER_SELECT} AND ${conditions.join(" AND ")} ORDER BY u.name`, {
            tenantId,
            status,
            search: search && dbHelper.likePattern(search),
        });
    },

    // For "pick a user" dropdowns such as the default reviewer or an application's officer
    assignable: (tenantId) => dbHelper.select(`${ASSIGNABLE_USERS} ORDER BY u.name`, {tenantId, statuses: LOGIN_STATUSES}),

    // That user if they can be picked in such a dropdown, else null
    findAssignable: (id, tenantId) => dbHelper.selectOne(`${ASSIGNABLE_USERS} AND u.id = :id`, {id, tenantId, statuses: LOGIN_STATUSES}),

    getById: (id, tenantId) =>
        dbHelper.selectOneOrFail(`${USER_SELECT} AND u.id = :id AND u.tenant_id = :tenantId`, {id, tenantId}, NOT_FOUND),

    create: async (values, currentUser) => {
        const role = await roleService.assertExists(values.roleId);
        await userService.assertMayManage(currentUser, role);

        const columns = await userService.toColumns(values);
        const user = await dbHelper.saveOrConflict(
            () => databaseModel.user.create({...columns, tenantId: currentUser.tenantId}),
            DUPLICATE_EMAIL
        );
        return userService.getById(user.id, currentUser.tenantId);
    },

    // 404 when the user is not in this tenant
    update: async (id, values, currentUser) => {
        const user = await userService.getById(id, currentUser.tenantId);
        await userService.assertMayManage(currentUser, {id: user.roleId, code: user.role});
        // Nobody locks themselves out
        if (id === currentUser.id && values.status && values.status !== USER_STATUSES.ACTIVE) {
            throw ApiError.of(HTTP_RESPONSES.HTTP_FORBIDDEN, "You cannot change your own status");
        }
        if (values.roleId) {
            // Nobody changes their own role, so an admin cannot lock the tenant out by demoting themselves
            if (id === currentUser.id && values.roleId !== currentUser.roleId) {
                throw ApiError.of(HTTP_RESPONSES.HTTP_FORBIDDEN, "You cannot change your own role");
            }
            const role = await roleService.assertExists(values.roleId);
            await userService.assertMayManage(currentUser, role);
        }

        const columns = await userService.toColumns(values, {endSessions: true});
        await dbHelper.saveOrConflict(
            () => databaseModel.user.update(columns, {where: {id, tenantId: currentUser.tenantId}}),
            DUPLICATE_EMAIL
        );
        // A password set by an admin logs the user out of every device, their sessions too
        if (values.password) await sessionService.endAll(id, END_REASONS.PASSWORD);
        return userService.getById(id, currentUser.tenantId);
    },

    // Soft delete: the user can no longer log in, and the email can be used for a new user
    remove: async (id, currentUser) => {
        if (id === currentUser.id) throw ApiError.of(HTTP_RESPONSES.HTTP_FORBIDDEN, "You cannot delete yourself");
        const user = await userService.getById(id, currentUser.tenantId);
        await userService.assertMayManage(currentUser, {id: user.roleId, code: user.role});

        await databaseModel.user.destroy({where: {id, tenantId: currentUser.tenantId}});
    },

    /**
     * Emails a user their login page, email and password (the "Send by Email" button after creating them).
     * The password is only stored hashed, so the caller sends it and it must be the user's current one.
     */
    sendCredentials: async (id, password, currentUser) =>
        userService.emailCredentials(await userService.getById(id, currentUser.tenantId), password, currentUser.tenantId),

    /**
     * Emails a user of tenantId their login details, from their institution (its SMTP, or Firmli's in its name).
     * Only for a user who can log in, and only with their current password, so nobody can mail made-up details.
     * Used by Users ("Send by Email") and by the Platform admin panel.
     */
    emailCredentials: async (user, password, tenantId) => {
        if (!LOGIN_STATUSES.includes(user.status)) {
            throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, `This user is ${user.status} and cannot log in`);
        }
        if (!(await authService.isCurrentPassword(user.id, password))) {
            throw ApiError.validation({password: "This is not the user's current password"});
        }

        const institution = await dbHelper.selectOne("SELECT name, contact_email AS contactEmail FROM tenants WHERE id = :tenantId", {tenantId});
        await emailHelper.send({
            tenantId,
            to: user.email,
            replyTo: institution.contactEmail,
            ...userEmails.credentials({name: user.name, email: user.email, password, institutionName: institution.name}),
        });
        return {sentTo: user.email};
    },

    /**
     * Another role may get the Users permission, but never makes, changes or deletes a user whose role ({id, code})
     * may do more than the current user may (a Super Admin only by a Super Admin). Otherwise anyone could raise
     * their own access through an account they control: give it a bigger role, or set a bigger role's password.
     */
    assertMayManage: async (currentUser, role) => {
        if (currentUser.role === ROLES.SUPER_ADMIN) return;
        if (role.code === ROLES.SUPER_ADMIN) throw ApiError.of(HTTP_RESPONSES.HTTP_FORBIDDEN, SUPER_ADMIN_ONLY);
        const permissions = await roleService.permissionsOf(role.id, currentUser.tenantId);
        const beyond = Object.entries(permissions).some(([module, actions]) =>
            Object.keys(actions).some((action) => actions[action] && !currentUser.permissions[module]?.[action])
        );
        if (beyond) throw ApiError.of(HTTP_RESPONSES.HTTP_FORBIDDEN, MORE_ACCESS);
    },

    // A plain password becomes passwordHash; the other fields pass through. With endSessions (an update),
    // the user's current tokens stop working too, so an admin's new password logs them out everywhere
    toColumns: async ({password, ...values}, {endSessions = false} = {}) => {
        if (!password) return values;
        const passwordColumns = endSessions
            ? await authService.passwordColumns(password)
            : {passwordHash: await authService.hashPassword(password)};
        return {...values, ...passwordColumns};
    },
};

export default userService;
