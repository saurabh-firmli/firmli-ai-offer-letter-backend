import express from "express";
import {rateLimit} from "express-rate-limit";
import authController from "../controllers/auth.controller.js";
import authenticate, {fromAllowedOrigin} from "../middlewares/auth.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import responseHelper from "../helpers/response.helper.js";
import {HTTP_RESPONSES} from "../constants/http-response-messages.constants.js";
import authValidation from "../schemas/validations/auth.validation.js";

// Per IP per 15 minutes. Behind a load balancer set TRUST_PROXY to the number of proxies (e.g. 1), or every user
// shares the proxy's IP
const limitPer15Minutes = (limit, message, {failedOnly = true} = {}) =>
    rateLimit({
        windowMs: 15 * 60 * 1000,
        limit,
        skipSuccessfulRequests: failedOnly,
        handler: (req, res) => responseHelper.errorResponse(res, HTTP_RESPONSES.HTTP_TOO_MANY_REQUESTS, `${message}, try again in 15 minutes`),
    });

// Slows down password guessing: failed attempts only
const loginLimit = limitPer15Minutes(10, "Too many failed logins");
const passwordLimit = limitPer15Minutes(10, "Too many wrong passwords");
const resetLinkLimit = limitPer15Minutes(10, "Too many invalid reset links");
// Every request counts, so nobody floods an inbox
const forgotLimit = limitPer15Minutes(5, "Too many reset requests", {failedOnly: false});
// A refresh only fails with a wrong or ended cookie
const refreshLimit = limitPer15Minutes(30, "Too many failed session refreshes");

const authRouter = express.Router();

// No signup: tenants and their first admin are created with `npm run create-tenant`,
// then the admin adds the other users through /v1/users
authRouter.post("/login", loginLimit, validate(authValidation.login), authController.login);
authRouter.get("/me", authenticate, authController.me);
authRouter.patch("/me", authenticate, validate(authValidation.updateMe), authController.updateMe);
// The refresh cookie: a new access token, this device's logout, Firmli staff switching back
authRouter.post("/refresh", fromAllowedOrigin, refreshLimit, authController.refresh);
authRouter.post("/logout", fromAllowedOrigin, authController.logout);
authRouter.post("/logout-all", authenticate, authController.logoutAll);
authRouter.post("/switch-back", fromAllowedOrigin, authenticate, authController.switchBack);
authRouter.post("/change-password", authenticate, passwordLimit, validate(authValidation.changePassword), authController.changePassword);

authRouter.post("/forgot-password", forgotLimit, validate(authValidation.forgotPassword), authController.forgotPassword);
authRouter.post("/reset-password/verify", resetLinkLimit, validate(authValidation.verifyResetToken), authController.verifyResetToken);
authRouter.post("/reset-password", resetLinkLimit, validate(authValidation.resetPassword), authController.resetPassword);

export default authRouter;
