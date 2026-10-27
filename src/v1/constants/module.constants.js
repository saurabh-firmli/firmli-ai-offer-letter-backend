// Codes of the rows in the modules table; role_module_permissions says what each role may do in them
export const MODULES = {
    APPLICATIONS: "applications",
    REVIEWS: "reviews",
    LETTERS: "letters",
    COMMUNICATIONS: "communications",
    PROGRAMS: "programs",
    CAMPUSES: "campuses",
    LETTER_TEMPLATES: "letter_templates",
    EMAIL_TEMPLATES: "email_templates",
    ELIGIBILITY: "eligibility",
    USERS: "users",
    ROLES: "roles",
    SETTINGS: "settings",
    AI_USAGE: "ai_usage",
    AUDIT_LOGS: "audit_logs",
};

// The permission an HTTP method needs on a module
export const ACTION_BY_METHOD = {
    GET: "read",
    POST: "create",
    PUT: "update",
    PATCH: "update",
    DELETE: "delete",
};

export const PERMISSION_ACTIONS = ["create", "read", "update", "delete"];

// Modules that do not have all four actions; the others stay off (e.g. nobody creates audit logs)
export const ACTIONS_BY_MODULE = {
    [MODULES.REVIEWS]: ["read", "update"],
    [MODULES.LETTERS]: ["create", "read", "update"],
    [MODULES.COMMUNICATIONS]: ["create", "read", "update"],
    [MODULES.ROLES]: ["read", "update"],
    [MODULES.SETTINGS]: ["read", "update"],
    [MODULES.AI_USAGE]: ["read"],
    [MODULES.AUDIT_LOGS]: ["read"],
};
