-- 004: tenants. Each client company is a tenant; every user, program and campus belongs to one.
-- A tenant and its first admin are created with `npm run create-tenant`; there is no signup.

CREATE TABLE tenants (
    id          INT          NOT NULL AUTO_INCREMENT,
    name        VARCHAR(150) NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rows created before tenants existed move to a "Default" tenant (only created if there are any)
INSERT INTO tenants (name)
SELECT 'Default' FROM DUAL
WHERE EXISTS (SELECT 1 FROM users) OR EXISTS (SELECT 1 FROM programs) OR EXISTS (SELECT 1 FROM campuses);

SET @default_tenant_id = (SELECT MIN(id) FROM tenants);

ALTER TABLE users
    ADD COLUMN tenant_id INT NULL AFTER id,
    ADD COLUMN role ENUM('admin', 'member') NOT NULL DEFAULT 'member' AFTER password_hash;
ALTER TABLE programs ADD COLUMN tenant_id INT NULL AFTER id;
ALTER TABLE campuses ADD COLUMN tenant_id INT NULL AFTER id;

-- Existing users become admins of the Default tenant
UPDATE users SET tenant_id = @default_tenant_id, role = 'admin';
UPDATE programs SET tenant_id = @default_tenant_id;
UPDATE campuses SET tenant_id = @default_tenant_id;

-- Emails stay unique across all tenants, so login needs only email + password
ALTER TABLE users
    MODIFY tenant_id INT NOT NULL,
    ADD CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);

-- Program codes and campus names only need to be unique inside a tenant
ALTER TABLE programs
    MODIFY tenant_id INT NOT NULL,
    DROP INDEX uq_programs_code,
    ADD UNIQUE KEY uq_programs_tenant_code (tenant_id, code),
    ADD CONSTRAINT fk_programs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);

ALTER TABLE campuses
    MODIFY tenant_id INT NOT NULL,
    DROP INDEX uq_campuses_name,
    ADD UNIQUE KEY uq_campuses_tenant_name (tenant_id, name),
    ADD CONSTRAINT fk_campuses_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id);
