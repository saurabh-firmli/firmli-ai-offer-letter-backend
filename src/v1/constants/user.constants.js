// A new user is inactive until their first login makes them active. Only an active user's token works;
// banned, blocked, deactivated and deleted users cannot log in at all
export const USER_STATUSES = {
    ACTIVE: "active",
    INACTIVE: "inactive",
    BANNED: "banned",
    BLOCKED: "blocked",
    DEACTIVATED: "deactivated",
    DELETED: "deleted",
};

export const LOGIN_STATUSES = [USER_STATUSES.ACTIVE, USER_STATUSES.INACTIVE];

// Shown to a user whose status is not active, at login and on any request after the change
export const statusMessage = (status) => `Your account is ${status}; contact your administrator`;

// How long a "Forgot password" link works
export const RESET_LINK_MINUTES = 60;
