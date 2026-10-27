-- 022: a client can send email through its own SMTP server (Settings → Email).
-- Off by default: every client uses Firmli's SMTP from the env file. When smtp_enabled is 1, that
-- client's emails go through its own server, from its own address. The SMTP password is stored
-- encrypted (AES-256-GCM, ENCRYPTION_KEY), like the OpenAI key.

ALTER TABLE tenant_settings
    ADD COLUMN smtp_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER email_max_retries,
    ADD COLUMN smtp_host VARCHAR(255) NULL AFTER smtp_enabled,
    ADD COLUMN smtp_port INT NULL AFTER smtp_host,
    ADD COLUMN smtp_secure TINYINT(1) NOT NULL DEFAULT 0 AFTER smtp_port,
    ADD COLUMN smtp_user VARCHAR(255) NULL AFTER smtp_secure,
    ADD COLUMN smtp_password_encrypted TEXT NULL AFTER smtp_user,
    ADD COLUMN smtp_from_email VARCHAR(255) NULL AFTER smtp_password_encrypted,
    ADD COLUMN smtp_from_name VARCHAR(150) NULL AFTER smtp_from_email;
