-- 040: refresh tokens. A login (one browser / device) is a session; its refresh token lives in an httpOnly
-- cookie and is stored here only as a SHA-256 hash. Access tokens (15 minutes) carry the session id, so
-- ending a session ends its access tokens at once too.
--
-- refresh_token_hash:  the session's current refresh token. Each refresh gives a new one (rotation).
-- previous_token_hash: the one it replaced, at rotated_at. Sent again within a few seconds (two tabs refreshing
--                      at once) it still gets an access token; later it means the token was copied, and the
--                      session is ended.
-- actor_user_id:       the Firmli staff member who switched into this user (switch user), else NULL; lets them
--                      switch back without logging in again.
-- ended_at / end_reason: logout, logout_all, password, reuse, switched_back, user_changed.

CREATE TABLE user_sessions (
    id                  INT          NOT NULL AUTO_INCREMENT,
    tenant_id           INT          NOT NULL,
    user_id             INT          NOT NULL,
    actor_user_id       INT          NULL,
    refresh_token_hash  CHAR(64)     NOT NULL,
    previous_token_hash CHAR(64)     NULL,
    rotated_at          DATETIME     NULL,
    expires_at          DATETIME     NOT NULL,
    last_used_at        DATETIME     NULL,
    ended_at            DATETIME     NULL,
    end_reason          VARCHAR(20)  NULL,
    user_agent          VARCHAR(255) NULL,
    ip_address          VARCHAR(45)  NULL,
    created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at          DATETIME     NULL,

    PRIMARY KEY (id),
    KEY idx_user_sessions_refresh (refresh_token_hash),
    KEY idx_user_sessions_previous (previous_token_hash),
    KEY idx_user_sessions_user (user_id, ended_at),
    CONSTRAINT fk_user_sessions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_user_sessions_user FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id),
    CONSTRAINT fk_user_sessions_actor FOREIGN KEY (actor_user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
