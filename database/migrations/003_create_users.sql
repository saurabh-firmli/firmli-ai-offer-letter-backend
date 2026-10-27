-- 003: users table for login / signup (src/v1/models/client/user.model.js)

CREATE TABLE users (
    id              INT          NOT NULL AUTO_INCREMENT,
    name            VARCHAR(150) NOT NULL,
    email           VARCHAR(255) NOT NULL,
    -- bcrypt hash, never the plain password
    password_hash   VARCHAR(255) NOT NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
