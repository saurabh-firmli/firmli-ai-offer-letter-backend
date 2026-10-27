-- 013: a tenant's Super Admin can change what each role may do, for that tenant only.
--
-- role_module_permissions stays the default for every tenant. A row in tenant_role_permissions
-- replaces the default for that tenant, role and module. The Super Admin role itself is never
-- changed (enforced by the API), so a tenant cannot lock itself out.
--
-- New module "roles" (Roles & Permissions): Super Admin may read and update it, Institution Admin
-- may read it. It has no create or delete.

CREATE TABLE tenant_role_permissions (
    id          INT        NOT NULL AUTO_INCREMENT,
    tenant_id   INT        NOT NULL,
    role_id     INT        NOT NULL,
    module_id   INT        NOT NULL,
    can_create  TINYINT(1) NOT NULL DEFAULT 0,
    can_read    TINYINT(1) NOT NULL DEFAULT 0,
    can_update  TINYINT(1) NOT NULL DEFAULT 0,
    can_delete  TINYINT(1) NOT NULL DEFAULT 0,
    created_at  DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at  DATETIME   NULL,
    not_deleted TINYINT    GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_tenant_role_permissions (tenant_id, role_id, module_id, not_deleted),
    CONSTRAINT fk_tenant_role_permissions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_tenant_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles (id),
    CONSTRAINT fk_tenant_role_permissions_module FOREIGN KEY (module_id) REFERENCES modules (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO modules (code, name, sort_order) VALUES ('roles', 'Roles & Permissions', 65);

INSERT INTO role_module_permissions (role_id, module_id, can_create, can_read, can_update, can_delete)
SELECT r.id, m.id, 0, 1, r.code = 'super_admin', 0
FROM roles r JOIN modules m ON m.code = 'roles' WHERE r.code IN ('super_admin', 'institution_admin');
