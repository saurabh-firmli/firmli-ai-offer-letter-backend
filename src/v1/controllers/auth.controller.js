import { asyncHandler } from "../utils/asyncHandler.js";
import responseHelper from "../helpers/response.helper.js";
import authService from "../services/auth.service.js";
import roleService from "../services/role.service.js";
import sessionService, {END_REASONS} from "../services/session.service.js";
import cookieHelper from "../helpers/cookie.helper.js";

// The browser and address a session is used from
export const requestMeta = (req) => ({userAgent: req.get("User-Agent"), ipAddress: req.ip});

// {user, token} in the body; a new refresh token goes into the httpOnly cookie, never into the body
export const answerSession = (res, {user, token, refreshToken, refreshExpiresAt}, message) => {
  if (refreshToken) cookieHelper.setRefresh(res, refreshToken, refreshExpiresAt);
  return responseHelper.ok(res, {user, token}, message);
};

// The session of the access token, when one came and is valid (also for a logout after it expired: then the cookie tells)
const sessionOfAccessToken = (req) => {
  const [scheme, token] = (req.get("Authorization") || "").split(" ");
  if (scheme !== "Bearer" || !token) return null;
  try {
    return authService.verifyToken(token).sessionId ?? null;
  } catch {
    return null;
  }
};

const authController = {
  login: asyncHandler(async (req, res) => {
    const userId = await authService.login(req.body);
    return answerSession(res, await sessionService.start(userId, requestMeta(req)), "Logged in");
  }),

  // A new access token from the refresh cookie (and a new cookie); a cookie that no longer works is cleared
  refresh: asyncHandler(async (req, res) => {
    try {
      return answerSession(res, await sessionService.refresh(cookieHelper.readRefresh(req), requestMeta(req)), "Session refreshed");
    } catch (error) {
      cookieHelper.clearRefresh(res);
      throw error;
    }
  }),

  // authenticate has already loaded the user; modules lists every module with its actions, for "Your access"
  me: asyncHandler(async (req, res) => responseHelper.ok(res, {...req.user, modules: await roleService.modules()})),

  updateMe: asyncHandler(async (req, res) => {
    const user = await authService.updateMe(req.user, req.body);
    return responseHelper.ok(res, user, "Profile updated");
  }),

  // This device only: its session ends and the cookie is cleared. Always answers 200, also when already logged out
  logout: asyncHandler(async (req, res) => {
    const sessionId = sessionOfAccessToken(req) ?? (await sessionService.findByRefreshToken(cookieHelper.readRefresh(req)))?.id;
    if (sessionId) await sessionService.end(sessionId, END_REASONS.LOGOUT);
    cookieHelper.clearRefresh(res);
    return responseHelper.ok(res, null, "Logged out");
  }),

  // Every device: every session and every access token of the user end
  logoutAll: asyncHandler(async (req, res) => {
    await authService.endAllTokens(req.user);
    await sessionService.endAll(req.user.id, END_REASONS.LOGOUT_ALL);
    cookieHelper.clearRefresh(res);
    return responseHelper.ok(res, null, "Logged out of every device");
  }),

  // This device stays logged in with a new access token; every other device is logged out
  changePassword: asyncHandler(async (req, res) => {
    await authService.changePassword(req.user, req.body);
    await sessionService.endAll(req.user.id, END_REASONS.PASSWORD, {except: req.sessionId});
    const session = req.sessionId ? await sessionService.accessToken(req.user.id, req.sessionId) : await sessionService.start(req.user.id, requestMeta(req));
    return answerSession(res, session, "Password changed");
  }),

  // Firmli staff who switched into a client's user go back to their own account
  switchBack: asyncHandler(async (req, res) => answerSession(res, await sessionService.switchBack(req.sessionId, requestMeta(req)), "Switched back")),

  forgotPassword: asyncHandler(async (req, res) => {
    await authService.forgotPassword(req.body, req.ip);
    return responseHelper.ok(res, null, "If an account exists for this email, a reset link is on its way");
  }),

  verifyResetToken: asyncHandler(async (req, res) => {
    const result = await authService.verifyResetToken(req.body);
    return responseHelper.ok(res, result);
  }),

  // Every session of the user ends; this browser gets a new one (the user is logged in)
  resetPassword: asyncHandler(async (req, res) => {
    const userId = await authService.resetPassword(req.body);
    await sessionService.endAll(userId, END_REASONS.PASSWORD);
    return answerSession(res, await sessionService.start(userId, requestMeta(req)), "Password updated");
  }),
};

export default authController;
