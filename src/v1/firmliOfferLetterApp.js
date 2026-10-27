import express from "express";
import cors from "cors";
import helmet from "helmet";

import config from "./configs/env.config.js";
import requestLogger from "./middlewares/requestLogger.middleware.js";
import customErrorMiddleware from "./middlewares/customError.middleware.js";
import responseHelper from "./helpers/response.helper.js";
import {HTTP_RESPONSES} from "./constants/http-response-messages.constants.js";
import authenticate, {authorize, platformOnly} from "./middlewares/auth.middleware.js";
import {MODULES} from "./constants/module.constants.js";
import healthRouter from "./routes/health.route.js";
import authRouter from "./routes/auth.route.js";
import programRouter from "./routes/program.route.js";
import campusRouter from "./routes/campus.route.js";
import userRouter from "./routes/user.route.js";
import locationRouter from "./routes/location.route.js";
import dropdownRouter from "./routes/dropdown.route.js";
import letterTemplateRouter from "./routes/letterTemplate.route.js";
import emailTemplateRouter from "./routes/emailTemplate.route.js";
import eligibilityRouter from "./routes/eligibility.route.js";
import roleRouter from "./routes/role.route.js";
import auditLogRouter from "./routes/auditLog.route.js";
import settingsRouter from "./routes/settings.route.js";
import aiUsageRouter from "./routes/aiUsage.route.js";
import applicationRouter from "./routes/application.route.js";
import dashboardRouter from "./routes/dashboard.route.js";
import manualReviewRouter from "./routes/manualReview.route.js";
import notificationRouter from "./routes/notification.route.js";
import reportRouter from "./routes/report.route.js";
import letterRouter from "./routes/letter.route.js";
import communicationRouter from "./routes/communication.route.js";
import platformRouter from "./routes/platform.route.js";
import eventRouter from "./routes/event.route.js";
import devRouter from "./routes/dev.route.js";

const firmliOfferLetterApp = express();

firmliOfferLetterApp.set("trust proxy", config.trustProxy);

// First, so every response (404s and errors included) is logged with a request id
firmliOfferLetterApp.use(requestLogger);
firmliOfferLetterApp.use(helmet());
// Browsers refuse cookies with "*", so cookies are only allowed for an explicit origin list
firmliOfferLetterApp.use(
    cors(config.cors.allowAnyOrigin ? {origin: "*"} : {origin: config.cors.origins, credentials: true})
);
firmliOfferLetterApp.use(express.json({limit: "1mb"}));
firmliOfferLetterApp.use(express.urlencoded({extended: false, limit: "1mb"}));

// Public routes
firmliOfferLetterApp.use("/v1/health", healthRouter);
firmliOfferLetterApp.use("/v1/auth", authRouter);
// Live updates: the ticket needs a login token, the stream its ticket (see routes/event.route.js)
firmliOfferLetterApp.use("/v1/events", eventRouter);

// Routes below need a logged in user, only see that user's tenant, and need the role's permission
// on the module (GET read, POST create, PUT / PATCH update, DELETE delete; POST is update in a module
// without create, e.g. Manual Review)
firmliOfferLetterApp.use("/v1/dashboard", authenticate, authorize(MODULES.APPLICATIONS), dashboardRouter);
firmliOfferLetterApp.use("/v1/reports", authenticate, authorize(MODULES.APPLICATIONS), reportRouter);
firmliOfferLetterApp.use("/v1/applications", authenticate, authorize(MODULES.APPLICATIONS), applicationRouter);
firmliOfferLetterApp.use("/v1/reviews", authenticate, authorize(MODULES.REVIEWS), manualReviewRouter);
// Each route checks its own Letters permission (see routes/letter.route.js)
firmliOfferLetterApp.use("/v1/letters", authenticate, letterRouter);
// Each route checks its own Communications permission (see routes/communication.route.js)
firmliOfferLetterApp.use("/v1/emails", authenticate, communicationRouter);
firmliOfferLetterApp.use("/v1/programs", authenticate, authorize(MODULES.PROGRAMS), programRouter);
firmliOfferLetterApp.use("/v1/campuses", authenticate, authorize(MODULES.CAMPUSES), campusRouter);
firmliOfferLetterApp.use("/v1/letter-templates", authenticate, authorize(MODULES.LETTER_TEMPLATES), letterTemplateRouter);
firmliOfferLetterApp.use("/v1/email-templates", authenticate, authorize(MODULES.EMAIL_TEMPLATES), emailTemplateRouter);
firmliOfferLetterApp.use("/v1/eligibility", authenticate, authorize(MODULES.ELIGIBILITY), eligibilityRouter);
firmliOfferLetterApp.use("/v1/users", authenticate, authorize(MODULES.USERS), userRouter);
firmliOfferLetterApp.use("/v1/roles", authenticate, authorize(MODULES.ROLES), roleRouter);
firmliOfferLetterApp.use("/v1/settings", authenticate, authorize(MODULES.SETTINGS), settingsRouter);
firmliOfferLetterApp.use("/v1/ai-usage", authenticate, authorize(MODULES.AI_USAGE), aiUsageRouter);
firmliOfferLetterApp.use("/v1/audit-logs", authenticate, authorize(MODULES.AUDIT_LOGS), auditLogRouter);
// Each count checks its own module permission (see services/notification.service.js)
firmliOfferLetterApp.use("/v1/notifications", authenticate, notificationRouter);
// Shared by all tenants, readable by any logged in user
firmliOfferLetterApp.use("/v1/locations", authenticate, locationRouter);
// Select box options ({value, label}) of the user's tenant, for any logged in user
firmliOfferLetterApp.use("/v1/dropdowns", authenticate, dropdownRouter);

// Firmli staff only (users of a platform tenant): switch tenant / user, and the Platform admin panel
firmliOfferLetterApp.use("/v1/dev", authenticate, platformOnly, devRouter);
firmliOfferLetterApp.use("/v1/platform", authenticate, platformOnly, platformRouter);

firmliOfferLetterApp.use((req, res) =>
    responseHelper.errorResponse(res, HTTP_RESPONSES.HTTP_NOT_FOUND, `${req.path} endpoint is not found.`)
);
firmliOfferLetterApp.use(customErrorMiddleware);

export default firmliOfferLetterApp;
