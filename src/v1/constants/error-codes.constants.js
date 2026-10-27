// Stable codes on error answers ("code" next to "message"), for the frontend to act on instead of
// reading the message text, which may change. Errors without a special meaning answer code null
export const ERROR_CODES = {
    // No token sent
    LOGIN_REQUIRED: "LOGIN_REQUIRED",
    // Token invalid or expired, user deleted, logged out or password changed: log in again
    SESSION_ENDED: "SESSION_ENDED",
    // The user's institution is blocked by Firmli: no login until it is unblocked
    TENANT_BLOCKED: "TENANT_BLOCKED",
    // The user is blocked, banned, deactivated or deleted
    ACCOUNT_NOT_ACTIVE: "ACCOUNT_NOT_ACTIVE",
    // The live updates ticket is invalid or expired: ask for a new one
    EVENTS_TICKET_INVALID: "EVENTS_TICKET_INVALID",
};
