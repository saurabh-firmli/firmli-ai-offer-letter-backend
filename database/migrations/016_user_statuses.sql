-- 016: more user statuses. Only active can log in; inactive, banned, blocked, deactivated and
-- deleted all refuse login and end a running session. Existing values stay as they are.
-- The "deleted" status keeps the user in the list; DELETE /v1/users/:id still removes them (deleted_at).

ALTER TABLE users
    MODIFY COLUMN status ENUM('active', 'inactive', 'banned', 'blocked', 'deactivated', 'deleted') NOT NULL DEFAULT 'active';
