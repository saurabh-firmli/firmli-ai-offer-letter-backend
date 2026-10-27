-- 014: user status and last login.
--
-- status: active (default) or blocked. A blocked user cannot log in, and their current token stops
-- working at once; unblocking gives access back. Unlike a delete, the user stays in the list.
-- last_login_at: set on every successful login, shown in the users list. It is not audit logged.

ALTER TABLE users
    ADD COLUMN status ENUM('active', 'blocked') NOT NULL DEFAULT 'active' AFTER role_id,
    ADD COLUMN last_login_at DATETIME NULL AFTER status;
