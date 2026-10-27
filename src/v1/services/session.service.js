import crypto from "node:crypto";
import _ from "lodash";
import {Op} from "sequelize";
import config from "../configs/env.config.js";
import databaseModel from "../utils/database.util.js";
import logger from "../utils/logger.util.js";
import {ApiError} from "../utils/ApiError.js";
import {HTTP_RESPONSES} from "../constants/http-response-messages.constants.js";
import {ERROR_CODES} from "../constants/error-codes.constants.js";
import {ROLES} from "../constants/role.constants.js";
import {USER_STATUSES} from "../constants/user.constants.js";
import {TENANT_STATUSES} from "../constants/tenant.constants.js";
import dbHelper from "../helpers/db.helper.js";
import authService, {SESSION_ENDED} from "./auth.service.js";

// Two tabs refreshing with the same cookie at once: the second one, this soon after, is not taken for a stolen token
const REUSE_GRACE_SECONDS = 30;

export const END_REASONS = {
    LOGOUT: "logout",
    LOGOUT_ALL: "logout_all",
    PASSWORD: "password",
    REUSE: "reuse",
    SWITCHED_BACK: "switched_back",
    USER_CHANGED: "user_changed",
};

const sessionEnded = (message = SESSION_ENDED, code = ERROR_CODES.SESSION_ENDED) => ApiError.of(HTTP_RESPONSES.HTTP_UNAUTHORIZED, message, code);

/**
 * Sessions: one per login (browser / device), kept with a refresh token in an httpOnly cookie. The access
 * token (15 minutes) names its session, so ending a session also ends its access tokens. Each refresh gives a
 * new refresh token (rotation); the old one sent again later means it was copied, and the session is ended.
 *
 * Every method that starts or refreshes a session answers {user, token, refreshToken, refreshExpiresAt}:
 * the controller puts refreshToken in the cookie (cookieHelper) and answers {user, token}.
 */
const sessionService = {
    /**
     * A new session for the user (login, password reset, switch user). meta: {userAgent, ipAddress}.
     * actorUserId: the Firmli staff member who switched into this user
     */
    start: async (userId, meta, {actorUserId = null} = {}) => {
        const {tenantId, tokenVersion} = await dbHelper.selectOne(
            "SELECT tenant_id AS tenantId, token_version AS tokenVersion FROM users WHERE id = :userId",
            {userId}
        );
        const refreshToken = sessionService.newToken();
        const session = await databaseModel.userSession.create({
            tenantId,
            userId,
            actorUserId,
            refreshTokenHash: sessionService.hash(refreshToken),
            expiresAt: sessionService.expiry(),
            lastUsedAt: new Date(),
            ...sessionService.metaColumns(meta),
        });
        return {
            user: await authService.findUser(userId),
            token: authService.issueToken(userId, tokenVersion, session.id),
            refreshToken,
            refreshExpiresAt: session.expiresAt,
        };
    },

    /**
     * A new access token for the session of this refresh token, and a new refresh token in place of it.
     * 401 SESSION_ENDED when there is no such live session; the user's own refusal (blocked, ...) when they may no
     * longer log in, which also ends the session.
     */
    refresh: async (refreshToken, meta) => {
        if (!refreshToken) throw sessionEnded();
        const hash = sessionService.hash(refreshToken);

        const result = await databaseModel.sequelize.transaction(async (transaction) => {
            // Locked, so two refreshes with the same token are taken one after the other
            const session = await dbHelper.selectOne(
                `SELECT id, user_id AS userId, refresh_token_hash = :hash AS isCurrent,
                        rotated_at > NOW() - INTERVAL :grace SECOND AS justRotated
                 FROM user_sessions
                 WHERE (refresh_token_hash = :hash OR previous_token_hash = :hash)
                       AND ended_at IS NULL AND expires_at > NOW() AND deleted_at IS NULL
                 LIMIT 1 FOR UPDATE`,
                {hash, grace: REUSE_GRACE_SECONDS},
                {transaction}
            );
            if (!session) return {refusal: sessionEnded()};

            const {refusal, code} = await authService.sessionUser({userId: session.userId});
            if (refusal) {
                await sessionService.end(session.id, END_REASONS.USER_CHANGED, transaction);
                return {refusal: sessionEnded(refusal, code)};
            }

            if (!session.isCurrent) {
                // The token this one replaced: a second tab a moment later gets an access token, the cookie it
                // already has stays; any later use means the old token was copied
                if (session.justRotated) return {session};
                await sessionService.end(session.id, END_REASONS.REUSE, transaction);
                return {refusal: sessionEnded(), reused: session};
            }

            const nextToken = sessionService.newToken();
            const expiresAt = sessionService.expiry();
            await databaseModel.userSession.update(
                {
                    previousTokenHash: hash,
                    refreshTokenHash: sessionService.hash(nextToken),
                    rotatedAt: new Date(),
                    lastUsedAt: new Date(),
                    expiresAt,
                    ...sessionService.metaColumns(meta),
                },
                {where: {id: session.id}, transaction}
            );
            return {session, refreshToken: nextToken, refreshExpiresAt: expiresAt};
        });

        if (result.reused) logger.warn({sessionId: result.reused.id, userId: result.reused.userId}, "An old refresh token was used again; session ended");
        if (result.refusal) throw result.refusal;
        const {userId, id: sessionId} = result.session;
        return {
            user: await authService.findUser(userId),
            token: authService.issueToken(userId, await authService.tokenVersionOf(userId), sessionId),
            refreshToken: result.refreshToken ?? null,
            refreshExpiresAt: result.refreshExpiresAt ?? null,
        };
    },

    // A new access token for a session that stays (after a password change on this device)
    accessToken: async (userId, sessionId) => ({
        user: await authService.findUser(userId),
        token: authService.issueToken(userId, await authService.tokenVersionOf(userId), sessionId),
    }),

    // The session of this refresh token, when it is live (logout without an access token from a session)
    findByRefreshToken: (refreshToken) =>
        refreshToken
            ? dbHelper.selectOne(
                  "SELECT id, user_id AS userId FROM user_sessions WHERE refresh_token_hash = :hash AND ended_at IS NULL AND deleted_at IS NULL",
                  {hash: sessionService.hash(refreshToken)}
              )
            : null,

    // Ends one session: its refresh token and its access tokens stop working
    end: (sessionId, reason, transaction) =>
        databaseModel.userSession.update({endedAt: new Date(), endReason: reason}, {where: {id: sessionId, endedAt: null}, transaction}),

    // Ends every session of the user, but `except` (the device that stays logged in)
    endAll: (userId, reason, {except, transaction} = {}) =>
        databaseModel.userSession.update(
            {endedAt: new Date(), endReason: reason},
            {where: {userId, endedAt: null, ...(except ? {id: {[Op.ne]: except}} : {})}, transaction}
        ),

    /**
     * "Back to Firmli": ends the session a staff member switched into and starts one for them again, without
     * their password, only while they are still an active Super Admin of a platform tenant.
     */
    switchBack: async (sessionId, meta) => {
        const session = sessionId
            ? await dbHelper.selectOne("SELECT actor_user_id AS actorUserId FROM user_sessions WHERE id = :sessionId AND ended_at IS NULL", {sessionId})
            : null;
        if (!session?.actorUserId) throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, "This session was not switched into from another user");

        await sessionService.end(sessionId, END_REASONS.SWITCHED_BACK);
        const actor = await authService.findUser(session.actorUserId);
        const mayStillSwitch = actor?.tenant.isPlatform && actor.role === ROLES.SUPER_ADMIN && actor.status === USER_STATUSES.ACTIVE && actor.tenant.status !== TENANT_STATUSES.BLOCKED;
        if (!mayStillSwitch) throw sessionEnded("You can no longer switch back; please log in again");
        return sessionService.start(actor.id, meta);
    },

    // The browser and address the session was last used from, for a future "your devices" list
    metaColumns: ({userAgent, ipAddress} = {}) => ({
        userAgent: userAgent ? _.truncate(userAgent, {length: 255}) : null,
        ipAddress: ipAddress ?? null,
    }),

    newToken: () => crypto.randomBytes(32).toString("base64url"),

    // Only the hash is stored, so a database leak gives no working refresh tokens
    hash: (token) => crypto.createHash("sha256").update(token).digest("hex"),

    // Sliding: each refresh starts the days again
    expiry: () => new Date(Date.now() + config.session.refreshDays * 86_400_000),
};

export default sessionService;
