import {RESPONSE_MESSAGES} from "../constants/http-response-messages.constants.js";

class ApiResponse {
    constructor(statusCode, data, message = RESPONSE_MESSAGES.DEFAULT_SUCCESS_MSG) {
        this.statusCode = statusCode;
        this.data = data;
        this.message = message;
        this.success = statusCode < 400;
    }
}

export { ApiResponse };
