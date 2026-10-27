import _ from "lodash";
import {HTTP_RESPONSES, RESPONSE_MESSAGES} from "../constants/http-response-messages.constants.js";
import {ApiResponse} from "../utils/ApiResponse.js";
import {ApiError} from "../utils/ApiError.js";

const responseHelper = {
    successResponse: (res, resStatus = HTTP_RESPONSES.HTTP_OK, payload = {}, message = "") => {
        return res
            .status(resStatus.statusCode)
            .json(new ApiResponse(resStatus.statusCode, payload, message || RESPONSE_MESSAGES.DEFAULT_SUCCESS_MSG));
    },

    ok: (res, payload, message) => responseHelper.successResponse(res, HTTP_RESPONSES.HTTP_OK, payload, message),

    created: (res, payload, message) => responseHelper.successResponse(res, HTTP_RESPONSES.HTTP_CREATED, payload, message),

    // {value: label} constants as dropdown options: [{value, label}]
    labelOptions: (labels) => _.map(labels, (label, value) => ({value, label})),

    // A plain string payload is sent as [{message: payload}]; code is one of ERROR_CODES (or none)
    errorResponse: (res, resStatus = HTTP_RESPONSES.HTTP_INTERNAL_SERVER_ERROR, payload = {}, message = "", code = null) => {
        const errors = _.isString(payload) ? [{message: payload}] : payload;
        const error = new ApiError(resStatus.statusCode, message || resStatus.statusMessage, errors);
        error.code = code;
        return res.status(resStatus.statusCode).json(error);
    },
};

export default responseHelper;
