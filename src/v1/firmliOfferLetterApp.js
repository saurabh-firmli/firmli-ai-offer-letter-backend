import express from "express";
import cors from "cors";
import helmet from "helmet";

import config from "./configs/env.config.js";
import requestLogger from "./middlewares/requestLogger.middleware.js";
import customErrorMiddleware from "./middlewares/customError.middleware.js";
import responseHelper from "./helpers/response.helper.js";
import {HTTP_RESPONSES} from "./constants/http-response-messages.constants.js";
import healthRouter from "./routes/health.route.js";

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

// Routes
firmliOfferLetterApp.use("/v1/health", healthRouter);

firmliOfferLetterApp.use((req, res) =>
    responseHelper.errorResponse(res, HTTP_RESPONSES.HTTP_NOT_FOUND, `${req.path} endpoint is not found.`)
);
firmliOfferLetterApp.use(customErrorMiddleware);

export default firmliOfferLetterApp;
