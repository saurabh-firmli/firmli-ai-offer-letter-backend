import {HTTP_RESPONSES} from "../constants/http-response-messages.constants.js";
import {ACTION_BY_METHOD, ACTIONS_BY_MODULE} from "../constants/module.constants.js";
import responseHelper from "../helpers/response.helper.js";
import authService, {SESSION_ENDED} from "../services/auth.service.js";
import requestContext from "../utils/requestContext.util.js";
import config from "../configs/env.config.js";
import {ERROR_CODES} from "../constants/error-codes.constants.js";
import {ROLES} from "../constants/role.constants.js";

const unauthorized = (res, message, code) => responseHelper.errorResponse(res, HTTP_RESPONSES.HTTP_UNAUTHORIZED, message, "", code);

/**
 * Lets the request through only with a valid login token in `Authorization: Bearer <token>`.
 * Sets req.user to the logged in user (with id, tenantId, role, permissions, tenant): services scope
 * every query to req.user.tenantId. The user is re-read on each request, so a deleted or non-active user,
 * a new role or changed permissions take effect at once instead of when the token expires.
 *
 * @example app.use("/v1/programs", authenticate, programRouter)
 */
const authenticate = async (req, res, next) => {
    const [scheme, token] = (req.get("Authorization") || "").split(" ");
    if (scheme !== "Bearer" || !token) return unauthorized(res, "Login required", ERROR_CODES.LOGIN_REQUIRED);

    let session;
    try {
        session = authService.verifyToken(token);
    } catch (error) {
        return unauthorized(res, SESSION_ENDED, ERROR_CODES.SESSION_ENDED);
    }

    try {
        const {user, refusal, code} = await authService.sessionUser(session);
        // 401, so the frontend logs the user out at once (code tells why, e.g. TENANT_BLOCKED)
        if (refusal) return unauthorized(res, refusal, code);
        req.user = user;
        // The session (device) of this token, for logout and change password; null for a token from before sessions
        req.sessionId = session.sessionId ?? null;
        if (req.log) req.log = req.log.child({userId: user.id, tenantId: user.tenantId});
        // Lets the audit log hooks know who made the change
        return requestContext.run({user, requestId: req.id, ipAddress: req.ip}, next);
    } catch (error) {
        return next(error);
    }
};

/**
 * Lets the request through only if the user's role may do this on the module. The action comes
 * from the HTTP method: GET read, POST create, PUT / PATCH update, DELETE delete. A module without that
 * action (e.g. Manual Review and Settings have only read and update) treats it as a change to an existing
 * record, so it needs update: a POST action on a case, removing the Settings logo.
 * Pass the action to override all that. Mount after authenticate.
 *
 * @example app.use("/v1/programs", authenticate, authorize(MODULES.PROGRAMS), programRouter)
 * @example router.post("/:id/approve", authorize(MODULES.LETTERS, "update"), controller.approve)
 */
export const authorize = (moduleCode, requiredAction) => (req, res, next) => {
    const methodAction = ACTION_BY_METHOD[req.method];
    const offered = ACTIONS_BY_MODULE[moduleCode]?.includes(methodAction) ?? true;
    const action = requiredAction ?? (offered ? methodAction : "update");
    if (req.user?.permissions?.[moduleCode]?.[action]) return next();

    return responseHelper.errorResponse(
        res,
        HTTP_RESPONSES.HTTP_FORBIDDEN,
        `You do not have permission to ${action} ${moduleCode.replace(/_/g, " ")}`
    );
};

/**
 * Lets the request through only for a Super Admin of a platform tenant (Firmli staff): the Platform panel and
 * switching into any client's user give full control over every tenant, so no other role gets them. Mount after authenticate.
 *
 * @example app.use("/v1/dev", authenticate, platformOnly, platformRouter)
 */
export const platformOnly = (req, res, next) =>
    req.user?.tenant?.isPlatform && req.user.role === ROLES.SUPER_ADMIN
        ? next()
        : responseHelper.errorResponse(res, HTTP_RESPONSES.HTTP_FORBIDDEN, "Only a Firmli Super Admin can use the Platform panel or switch users");

export default authenticate;

/**
 * For the routes that use the refresh cookie (refresh, logout, switch back): a request sent from a site that is
 * not one of CORS_ORIGINS is refused, so another site cannot make the browser use the cookie for it.
 * Without an Origin header (not a browser's cross-site request) or with CORS_ORIGINS=* it goes on.
 */
export const fromAllowedOrigin = (req, res, next) => {
    const origin = req.get("Origin");
    if (!origin || config.cors.allowAnyOrigin || config.cors.origins.includes(origin)) return next();
    return responseHelper.errorResponse(res, HTTP_RESPONSES.HTTP_FORBIDDEN, "Requests from this site are not allowed");
};
