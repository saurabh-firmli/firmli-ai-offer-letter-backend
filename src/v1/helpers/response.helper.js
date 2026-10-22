import {HTTP_RESPONSES, RESPONSE_MESSAGES} from "../constants/http-response-messages.constants.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import {ApiError} from "../utils/ApiError.js";

const responseHelper = {
    successResponse: (res, resStatus = HTTP_RESPONSES.HTTP_OK, payload = {}, message = "") => {
        return res
            .status(resStatus.statusCode)
            .json(new ApiResponse(resStatus.statusCode, payload, message || RESPONSE_MESSAGES.DEFAULT_SUCCESS_MSG));
    },

    // A plain string payload is sent as [{message: payload}]
    errorResponse: (res, resStatus = HTTP_RESPONSES.HTTP_INTERNAL_SERVER_ERROR, payload = {}, message = "") => {
        const errors = typeof payload === "string" ? [{message: payload}] : payload;
        return res
            .status(resStatus.statusCode)
            .json(new ApiError(resStatus.statusCode, message || resStatus.statusMessage, errors));
    },
};

export default responseHelper;
