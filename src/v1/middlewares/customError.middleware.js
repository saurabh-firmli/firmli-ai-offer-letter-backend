import {ApiError} from "../utils/ApiError.js";
import config from "../configs/env.config.js";
import {RESPONSE_MESSAGES} from "../constants/http-response-messages.constants.js";

// Catches every error passed to next(err), including those from handlers wrapped in asyncHandler
const customErrorMiddleware = (err, req, res, next) => {
    let error = err;

    if (!(error instanceof ApiError)) {
        // Keep a 4xx/5xx code set by a library (e.g. 400 for invalid JSON), otherwise 500
        const statusCode = err?.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
        error = new ApiError(statusCode, err?.message || RESPONSE_MESSAGES.DEFAULT_ERROR_MSG, err?.errors || [], err?.stack);
    }

    // The request logger then logs the error and stack on this request's line
    if (error.statusCode >= 500) res.err = err;

    return res.status(error.statusCode).json({
        ...error.toJSON(),
        ...(config.isDevelopment ? {stack: error.stack} : {}),
    });
};

export default customErrorMiddleware;
