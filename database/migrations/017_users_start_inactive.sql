-- 017: a new user starts as inactive; their first successful login makes them active.
-- Existing users keep their status.

ALTER TABLE users
    MODIFY COLUMN status ENUM('active', 'inactive', 'banned', 'blocked', 'deactivated', 'deleted') NOT NULL DEFAULT 'inactive';
