import {RESPONSE_MESSAGES} from "../constants/http-response-messages.constants.js";

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
    if (stack) this.stack = stack;
  }

  // Error.message is not enumerable, so list the response fields explicitly
  toJSON() {
    return {
      statusCode: this.statusCode,
      data: this.data,
      message: this.message,
      success: this.success,
      errors: this.errors,
    };
  }
}

export { ApiError };
