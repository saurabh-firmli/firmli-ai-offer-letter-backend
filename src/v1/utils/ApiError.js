import {HTTP_RESPONSES, RESPONSE_MESSAGES} from "../constants/http-response-messages.constants.js";

class ApiError extends Error {
  /**
   * @param {number} statusCode
   * @param {string} message
   * @param {any} errors
   * @param {string} stack
   */
  constructor(statusCode, message = RESPONSE_MESSAGES.DEFAULT_ERROR_MSG, errors = [], stack = "") {
    super(message);
    this.statusCode = statusCode;
    this.data = null;
    this.success = false;
    this.errors = errors;
    // A stable ERROR_CODES value the frontend can act on, or null
    this.code = null;
    if (stack) this.stack = stack;
  }

  /**
   * One message with a status from HTTP_RESPONSES, and optionally a code from ERROR_CODES.
   * @example throw ApiError.of(HTTP_RESPONSES.HTTP_NOT_FOUND, "Program not found")
   * @example throw ApiError.of(HTTP_RESPONSES.HTTP_FORBIDDEN, TENANT_BLOCKED_MESSAGE, ERROR_CODES.TENANT_BLOCKED)
   */
  static of(resStatus, message, code = null) {
    const error = new ApiError(resStatus.statusCode, message, [{message}]);
    error.code = code;
    return error;
  }

  /**
   * 422 with {field: message}, the same shape as the validate middleware's errors.
   * @example throw ApiError.validation({campusId: "Campus not found"})
   */
  static validation(errors) {
    const {statusCode, statusMessage} = HTTP_RESPONSES.HTTP_UNPROCESSABLE_ENTITY;
    return new ApiError(statusCode, statusMessage, errors);
  }

  // Error.message is not enumerable, so list the response fields explicitly
  toJSON() {
    return {
      statusCode: this.statusCode,
      data: this.data,
      message: this.message,
      success: this.success,
      code: this.code,
      errors: this.errors,
    };
  }
}

export { ApiError };
