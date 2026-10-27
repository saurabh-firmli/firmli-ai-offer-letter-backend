import crypto from "node:crypto";
import _ from "lodash";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import config from "../configs/env.config.js";
import {ApiError} from "../utils/ApiError.js";
import {HTTP_RESPONSES} from "../constants/http-response-messages.constants.js";
import databaseModel from "../utils/database.util.js";
import dbHelper from "../helpers/db.helper.js";
import requestContext from "../utils/requestContext.util.js";
import logger from "../utils/logger.util.js";
import emailHelper from "../helpers/email.helper.js";
import userEmails from "../emails/user.email.js";
import {LOGIN_STATUSES, RESET_LINK_MINUTES, statusMessage, USER_STATUSES} from "../constants/user.constants.js";
import {TENANT_BLOCKED_MESSAGE, TENANT_STATUSES} from "../constants/tenant.constants.js";
import {ERROR_CODES} from "../constants/error-codes.constants.js";
import roleService from "./role.service.js";

const BCRYPT_ROUNDS = 10;
// For logins with an unknown email (see standInHash)
let standInHash = null;

export const SESSION_ENDED = "Session expired or invalid, please log in again";
const INVALID_RESET_LINK = "This reset link is invalid or has expired, please ask for a new one";
const EVENTS_TICKET = "events";
const EVENTS_TICKET_SECONDS = 60;

const USER_COLUMNS = `
    u.id, u.tenant_id AS tenantId, u.name, u.email,
    u.role_id AS roleId, r.code AS role, r.name AS roleName, u.status, u.last_login_at AS lastLoginAt,
    u.created_at AS createdAt, u.updated_at AS updatedAt,
    t.name AS tenantName, t.is_platform AS tenantIsPlatform, t.status AS tenantStatus`;

// A deleted user, or any user of a deleted tenant, can no longer log in or use a token
const LIVE_USERS = `
    FROM users u
    JOIN tenants t ON t.id = u.tenant_id
    JOIN roles r ON r.id = u.role_id
    WHERE u.deleted_at IS NULL AND t.deleted_at IS NULL AND r.deleted_at IS NULL`;

const authService = {
    /**
     * Checks the email and password and answers the user's id; the caller starts the session (sessionService.start).
     * Same answer for an unknown email and a wrong password, so it does not reveal who has an account
     */
    login: async ({email, password}) => {
        // One of the two queries that read password_hash (the other is isCurrentPassword)
        const row = await dbHelper.selectOne(
            `SELECT ${USER_COLUMNS}, u.password_hash AS passwordHash ${LIVE_USERS} AND u.email = :email`,
            {email}
        );
        // An unknown email is checked against a stand-in hash, so it takes as long as a wrong password
        const passwordHash = row?.passwordHash ?? (await authService.standInHash());
        if (!(await bcrypt.compare(password, passwordHash)) || !row) {
            throw ApiError.of(HTTP_RESPONSES.HTTP_UNAUTHORIZED, "Invalid email or password");
        }
        // Told only after the right password, so it does not reveal who has an account
        if (row.tenantStatus === TENANT_STATUSES.BLOCKED) throw ApiError.of(HTTP_RESPONSES.HTTP_FORBIDDEN, TENANT_BLOCKED_MESSAGE, ERROR_CODES.TENANT_BLOCKED);
        if (!LOGIN_STATUSES.includes(row.status)) throw ApiError.of(HTTP_RESPONSES.HTTP_FORBIDDEN, statusMessage(row.status), ERROR_CODES.ACCOUNT_NOT_ACTIVE);

        await authService.recordLogin(row);
        return row.id;
    },

    // Sets lastLoginAt. An inactive user's login also makes them active, logged as their own change
    recordLogin: (user) => {
        const activates = user.status === USER_STATUSES.INACTIVE;
        const lastLoginAt = new Date();
        // Otherwise updatedAt is written back as it was, so MySQL's ON UPDATE does not count a login as an edit
        const values = activates ? {lastLoginAt, status: USER_STATUSES.ACTIVE} : {lastLoginAt, updatedAt: user.updatedAt};
        return requestContext.run({user: _.pick(user, ["id", "name", "tenantId"])}, () =>
            databaseModel.user.update(values, {where: {id: user.id}, silent: !activates})
        );
    },

    /**
     * null when the user (or their tenant) was deleted after the token was issued, or, with tokenVersion,
     * when the token was ended by a logout-all or a password change, or, with sessionId, when that session
     * (one device) was ended. A non-active user is returned.
     */
    findUser: async (id, tokenVersion, sessionId) => {
        const sameVersion = tokenVersion === undefined ? "" : "AND u.token_version = :tokenVersion";
        const liveSession = sessionId
            ? "AND EXISTS (SELECT 1 FROM user_sessions s WHERE s.id = :sessionId AND s.user_id = u.id AND s.ended_at IS NULL AND s.deleted_at IS NULL)"
            : "";
        const row = await dbHelper.selectOne(`SELECT ${USER_COLUMNS} ${LIVE_USERS} AND u.id = :id ${sameVersion} ${liveSession}`, {id, tokenVersion, sessionId});
        return row && authService.toUser(row);
    },

    /**
     * The user behind a verified token, ticket or session, or {refusal, code} when they may not go on: deleted,
     * logged out, password changed (SESSION_ENDED), institution blocked (TENANT_BLOCKED), or not active (ACCOUNT_NOT_ACTIVE).
     */
    sessionUser: async ({userId, tokenVersion, sessionId}) => {
        const user = await authService.findUser(userId, tokenVersion, sessionId);
        if (!user) return {refusal: SESSION_ENDED, code: ERROR_CODES.SESSION_ENDED};
        if (user.tenant.status === TENANT_STATUSES.BLOCKED) return {refusal: TENANT_BLOCKED_MESSAGE, code: ERROR_CODES.TENANT_BLOCKED};
        if (user.status !== USER_STATUSES.ACTIVE) return {refusal: statusMessage(user.status), code: ERROR_CODES.ACCOUNT_NOT_ACTIVE};
        return {user};
    },

    tokenVersionOf: async (userId) =>
        (await dbHelper.selectOne("SELECT token_version AS tokenVersion FROM users WHERE id = :userId", {userId})).tokenVersion,

    // My profile: only the name; email, role and status are changed by an admin (Users)
    updateMe: async (user, {name}) => {
        await databaseModel.user.update({name}, {where: {id: user.id}});
        return authService.findUser(user.id);
    },

    // Ends every access token of the user, on all devices (with sessionService.endAll for their sessions)
    endAllTokens: (user) =>
        databaseModel.user.update(
            {tokenVersion: databaseModel.sequelize.literal("token_version + 1")},
            {where: {id: user.id}, silent: true}
        ),

    // A wrong current password is a 422 on that field, so the form can show it there
    changePassword: async (user, {currentPassword, newPassword}) => {
        if (!(await authService.isCurrentPassword(user.id, currentPassword))) {
            throw ApiError.validation({currentPassword: "The current password is incorrect"});
        }
        await authService.setPassword(user.id, newPassword);
        authService.notifyPasswordChanged(user);
    },

    /**
     * "Forgot password": emails a one-time reset link. Always answers the same and sends in the
     * background, so neither the answer nor its timing reveals who has an account.
     */
    forgotPassword: async ({email}, ipAddress) => {
        const user = await dbHelper.selectOne(`SELECT ${USER_COLUMNS} ${LIVE_USERS} AND u.email = :email`, {email});
        if (!user || !LOGIN_STATUSES.includes(user.status) || user.tenantStatus === TENANT_STATUSES.BLOCKED) return;

        const token = crypto.randomBytes(32).toString("base64url");
        await databaseModel.sequelize.transaction(async (transaction) => {
            await authService.expireResetLinks(user.id, transaction);
            await databaseModel.passwordReset.create(
                {
                    tenantId: user.tenantId,
                    userId: user.id,
                    tokenHash: authService.hashResetToken(token),
                    expiresAt: new Date(Date.now() + RESET_LINK_MINUTES * 60_000),
                    ipAddress,
                },
                {transaction}
            );
        });

        const resetUrl = `${config.frontendUrl}/reset-password?token=${token}`;
        authService.sendInBackground(
            user,
            userEmails.passwordReset({name: user.name, resetUrl, minutes: RESET_LINK_MINUTES, institutionName: user.tenantName})
        );
    },

    // For the reset page, before the form is shown: whose link it is
    verifyResetToken: async ({token}) => {
        const reset = await authService.findResetLink(token);
        if (!reset) throw ApiError.of(HTTP_RESPONSES.HTTP_BAD_REQUEST, INVALID_RESET_LINK);
        return {email: reset.email};
    },

    // Sets the new password, ends the link and every old token; answers the user's id for a new session (like a login)
    resetPassword: async ({token, password}) => {
        const userId = await databaseModel.sequelize.transaction(async (transaction) => {
            // Locked, so the same link cannot be used twice at once
            const reset = await authService.findResetLink(token, transaction);
            if (!reset) throw ApiError.of(HTTP_RESPONSES.HTTP_BAD_REQUEST, INVALID_RESET_LINK);

            await authService.expireResetLinks(reset.userId, transaction);
            // No one is logged in: the audit log shows the user changing their own password
            await requestContext.run({user: {id: reset.userId, name: reset.name, tenantId: reset.tenantId}}, () =>
                authService.setPassword(reset.userId, password, transaction)
            );
            return reset.userId;
        });

        const user = await authService.findUser(userId);
        await authService.recordLogin(user);
        authService.notifyPasswordChanged(user);
        return userId;
    },

    // An unused, unexpired link of a user who may still log in
    findResetLink: (token, transaction) =>
        dbHelper.selectOne(
            `SELECT pr.id, pr.user_id AS userId, u.tenant_id AS tenantId, u.name, u.email
             FROM password_resets pr
             JOIN users u ON u.id = pr.user_id AND u.deleted_at IS NULL AND u.status IN (:loginStatuses)
             JOIN tenants t ON t.id = u.tenant_id AND t.deleted_at IS NULL AND t.status = 'active'
             WHERE pr.token_hash = :tokenHash AND pr.used_at IS NULL AND pr.expires_at > NOW() AND pr.deleted_at IS NULL
             ${transaction ? "FOR UPDATE" : ""}`,
            {tokenHash: authService.hashResetToken(token), loginStatuses: LOGIN_STATUSES},
            {transaction}
        ),

    expireResetLinks: (userId, transaction) =>
        databaseModel.passwordReset.update({usedAt: new Date()}, {where: {userId, usedAt: null}, transaction}),

    // Only the hash is stored, so a database leak gives no working links
    hashResetToken: (token) => crypto.createHash("sha256").update(token).digest("hex"),

    setPassword: async (userId, password, transaction) =>
        databaseModel.user.update(await authService.passwordColumns(password), {where: {id: userId}, transaction}),

    // A new password also adds 1 to tokenVersion, so every token issued before stops working
    passwordColumns: async (password) => ({
        passwordHash: await authService.hashPassword(password),
        passwordChangedAt: new Date(),
        tokenVersion: databaseModel.sequelize.literal("token_version + 1"),
    }),

    notifyPasswordChanged: (user) =>
        authService.sendInBackground(
            user,
            userEmails.passwordChanged({name: user.name, email: user.email, institutionName: user.tenant.name})
        ),

    // The request does not wait for (or fail on) these emails; a failure is only logged
    sendInBackground: (user, content) =>
        setImmediate(() =>
            emailHelper
                .send({tenantId: user.tenantId, to: user.email, ...content})
                .catch((error) => logger.warn({err: error, userId: user.id, subject: content.subject}, "Account email not sent"))
        ),

    hashPassword: (password) => bcrypt.hash(password, BCRYPT_ROUNDS),

    // A hash with the same cost as real ones, made once; no password matches it
    standInHash: () => (standInHash ??= authService.hashPassword(crypto.randomBytes(32).toString("hex"))),

    // Whether this is the user's password now, e.g. before emailing it to them
    isCurrentPassword: async (userId, password) => {
        const row = await dbHelper.selectOne("SELECT password_hash AS passwordHash FROM users WHERE id = :userId", {userId});
        return Boolean(row) && bcrypt.compare(password, row.passwordHash);
    },

    /**
     * The access token (JWT_EXPIRES_IN, 15 minutes): user id, token version and the session (device) it belongs to;
     * tenant, role and permissions are read from the database on each request. The refresh cookie gets a new one
     */
    issueToken: (userId, tokenVersion, sessionId) => authService.sign(userId, tokenVersion, {sessionId, expiresIn: config.jwt.expiresIn}),

    // {userId, tokenVersion, sessionId?}; throws when the token is tampered with or expired, or is an events ticket
    verifyToken: (token) => authService.verify(token),

    /**
     * A short-lived ticket to open the live updates stream (EventSource cannot send a header, so it goes
     * in the URL), for the same session. It only opens that stream: it is never accepted as a login token.
     */
    issueEventsTicket: async (user, sessionId) => {
        const tokenVersion = await authService.tokenVersionOf(user.id);
        return {ticket: authService.sign(user.id, tokenVersion, {sessionId, purpose: EVENTS_TICKET, expiresIn: EVENTS_TICKET_SECONDS}), expiresIn: EVENTS_TICKET_SECONDS};
    },

    // {userId, tokenVersion, sessionId?} of a valid events ticket; throws otherwise
    verifyEventsTicket: (ticket) => authService.verify(ticket, EVENTS_TICKET),

    // A signed token: user id, token version, its session, and for a special-use token such as an events ticket its purpose
    sign: (userId, tokenVersion, {sessionId, purpose, expiresIn}) =>
        jwt.sign({ver: tokenVersion, ...(sessionId && {sid: sessionId}), ...(purpose && {purpose})}, config.jwt.secret, {
            subject: String(userId),
            expiresIn,
            algorithm: "HS256",
        }),

    /**
     * {userId, tokenVersion, sessionId?} when the token is valid and made for this purpose (none = a login token).
     * A token without a version counts as 0; one from before sessions has no sessionId
     */
    verify: (token, purpose) => {
        const payload = jwt.verify(token, config.jwt.secret, {algorithms: ["HS256"]});
        if (payload.purpose !== purpose) throw new Error(purpose ? `Not a ${purpose} ticket` : "Not a login token");
        return {userId: Number(payload.sub), tokenVersion: Number(payload.ver ?? 0), ...(payload.sid && {sessionId: Number(payload.sid)})};
    },

    // tenantName -> tenant: {id, name, isPlatform, status}, plus what the user's role may do in each module
    toUser: async ({tenantName, tenantIsPlatform, tenantStatus, ...user}) => ({
        ...user,
        tenant: {id: user.tenantId, name: tenantName, isPlatform: Boolean(tenantIsPlatform), status: tenantStatus},
        permissions: await roleService.permissionsOf(user.roleId, user.tenantId),
    }),
};

export default authService;
