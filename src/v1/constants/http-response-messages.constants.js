const RESPONSE_MESSAGES = {
    DEFAULT_ERROR_MSG: "Something Went Wrong!",
    DEFAULT_SUCCESS_MSG: "Success",
};

// Only the codes the app uses; add more here when needed
const HTTP_RESPONSES = {
    HTTP_OK: {statusCode: 200, statusMessage: "OK"},
    HTTP_CREATED: {statusCode: 201, statusMessage: "Created"},
    HTTP_ACCEPTED: {statusCode: 202, statusMessage: "Accepted"},
    HTTP_NO_CONTENT: {statusCode: 204, statusMessage: "No Content"},
    HTTP_BAD_REQUEST: {statusCode: 400, statusMessage: "Bad Request"},
    HTTP_UNAUTHORIZED: {statusCode: 401, statusMessage: "Unauthorized"},
    HTTP_FORBIDDEN: {statusCode: 403, statusMessage: "Forbidden"},
    HTTP_NOT_FOUND: {statusCode: 404, statusMessage: "Not Found"},
    HTTP_CONFLICT: {statusCode: 409, statusMessage: "Conflict"},
    HTTP_UNPROCESSABLE_ENTITY: {statusCode: 422, statusMessage: "Unprocessable Entity"},
    HTTP_TOO_MANY_REQUESTS: {statusCode: 429, statusMessage: "Too Many Requests"},
    HTTP_INTERNAL_SERVER_ERROR: {statusCode: 500, statusMessage: "Internal Server Error"},
    HTTP_BAD_GATEWAY: {statusCode: 502, statusMessage: "Bad Gateway"},
    HTTP_SERVICE_UNAVAILABLE: {statusCode: 503, statusMessage: "Service Unavailable"},
};

export {HTTP_RESPONSES, RESPONSE_MESSAGES};
