-- 024: forgot / reset password, change password and logout.
--
-- users.token_version: carried in every login token. Logout, a password change or a password reset adds 1,
-- so every token issued before stops working (the user is logged out on all devices).
-- users.password_changed_at: when the password was last changed (shown in the audit log).
--
-- password_resets: one row per "Forgot password" email. Only the SHA-256 hash of the link's token is
-- stored, never the token. A link works once, for 60 minutes; asking again or using one expires the others.

ALTER TABLE users
    ADD COLUMN token_version INT NOT NULL DEFAULT 0 AFTER last_login_at,
    ADD COLUMN password_changed_at DATETIME NULL AFTER token_version;

CREATE TABLE password_resets (
    id          INT         NOT NULL AUTO_INCREMENT,
    tenant_id   INT         NOT NULL,
    user_id     INT         NOT NULL,
    token_hash  CHAR(64)    NOT NULL,
    expires_at  DATETIME    NOT NULL,
    used_at     DATETIME    NULL,
    ip_address  VARCHAR(45) NULL,
    created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at  DATETIME    NULL,

    PRIMARY KEY (id),
    KEY idx_password_resets_token (token_hash),
    KEY idx_password_resets_user (user_id),
    CONSTRAINT fk_password_resets_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
