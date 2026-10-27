// A tenant is active, or blocked by Firmli staff: then none of its users can log in or use a token
export const TENANT_STATUSES = {ACTIVE: "active", BLOCKED: "blocked"};
export const TENANT_STATUS_LABELS = {active: "Active", blocked: "Blocked"};

// Shown to a blocked tenant's users at login and on any request after the block
export const TENANT_BLOCKED_MESSAGE = "Your institution's account is blocked; contact Firmli";
