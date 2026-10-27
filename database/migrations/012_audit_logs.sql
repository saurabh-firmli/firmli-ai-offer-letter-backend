-- 012: audit log of every create / update / delete made through the app: who, when, on what, and
-- for an update each changed field "from -> to". Written by Sequelize hooks (helpers/audit.helper.js).
-- Rows are only ever added: the app never updates or deletes them (deleted_at only keeps the
-- every-table-has-it rule).
--
-- module is the module code (programs, eligibility, ...) so logs can be filtered by module and action.
-- A new "audit_logs" module that every role may read; nobody may create, update or delete. The API
-- shows the Super Admin every log of the tenant and everyone else only their own.

CREATE TABLE audit_logs (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    tenant_id     INT          NULL,
    user_id       INT          NULL,
    user_name     VARCHAR(150) NULL,
    module        VARCHAR(50)  NOT NULL,
    entity_type   VARCHAR(50)  NOT NULL,
    entity_id     INT          NULL,
    entity_label  VARCHAR(255) NULL,
    action        ENUM('create', 'update', 'delete') NOT NULL,
    changes       JSON         NULL,
    request_id    VARCHAR(128) NULL,
    ip_address    VARCHAR(45)  NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at    DATETIME     NULL,

    PRIMARY KEY (id),
    KEY idx_audit_logs_tenant_created (tenant_id, created_at),
    KEY idx_audit_logs_tenant_module (tenant_id, module, action, created_at),
    KEY idx_audit_logs_tenant_entity (tenant_id, entity_type, entity_id),
    KEY idx_audit_logs_tenant_user (tenant_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO modules (code, name, sort_order) VALUES ('audit_logs', 'Audit Logs', 70);

INSERT INTO role_module_permissions (role_id, module_id, can_create, can_read, can_update, can_delete)
SELECT r.id, m.id, 0, 1, 0, 0 FROM roles r JOIN modules m ON m.code = 'audit_logs';
