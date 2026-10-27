-- 011: roles and module permissions, the same for every tenant (like letter_variables).
--
-- roles: who a user is (Super Admin, Institution Admin, Admissions Officer, Reviewer, Read Only).
-- modules: the parts of the app (Programs, Campuses, ...).
-- role_module_permissions: which modules a role may use and what it may do there
-- (create / read / update / delete). No row = no access to that module.
-- The API reads these rows; they change only through migrations, since they apply to all tenants.
--
-- users.role (admin / member) becomes users.role_id: admins get Super Admin, members get
-- Admissions Officer.

CREATE TABLE roles (
    id          INT          NOT NULL AUTO_INCREMENT,
    code        VARCHAR(50)  NOT NULL,
    name        VARCHAR(100) NOT NULL,
    description VARCHAR(255) NULL,
    sort_order  INT          NOT NULL DEFAULT 0,
    deleted_at  DATETIME     NULL,
    not_deleted TINYINT      GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_roles_code (code, not_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO roles (code, name, description, sort_order) VALUES
    ('super_admin',        'Super Admin',        'Everything, including users',                                  10),
    ('institution_admin',  'Institution Admin',  'Sets up programs, campuses, templates and eligibility',        20),
    ('admissions_officer', 'Admissions Officer', 'Works on programs and templates; reads the rest of the setup', 30),
    ('reviewer',           'Reviewer',           'Reviews applications; reads the setup',                        40),
    ('read_only',          'Read Only',          'Reads the setup',                                              50);

CREATE TABLE modules (
    id          INT          NOT NULL AUTO_INCREMENT,
    code        VARCHAR(50)  NOT NULL,
    name        VARCHAR(100) NOT NULL,
    sort_order  INT          NOT NULL DEFAULT 0,
    deleted_at  DATETIME     NULL,
    not_deleted TINYINT      GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_modules_code (code, not_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO modules (code, name, sort_order) VALUES
    ('programs',         'Programs',         10),
    ('campuses',         'Campuses',         20),
    ('letter_templates', 'Letter Templates', 30),
    ('email_templates',  'Email Templates',  40),
    ('eligibility',      'Eligibility',      50),
    ('users',            'Users',            60);

CREATE TABLE role_module_permissions (
    id          INT        NOT NULL AUTO_INCREMENT,
    role_id     INT        NOT NULL,
    module_id   INT        NOT NULL,
    can_create  TINYINT(1) NOT NULL DEFAULT 0,
    can_read    TINYINT(1) NOT NULL DEFAULT 0,
    can_update  TINYINT(1) NOT NULL DEFAULT 0,
    can_delete  TINYINT(1) NOT NULL DEFAULT 0,
    deleted_at  DATETIME   NULL,
    not_deleted TINYINT    GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_role_module_permissions (role_id, module_id, not_deleted),
    CONSTRAINT fk_role_module_permissions_role FOREIGN KEY (role_id) REFERENCES roles (id),
    CONSTRAINT fk_role_module_permissions_module FOREIGN KEY (module_id) REFERENCES modules (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Super Admin: every module, every action
INSERT INTO role_module_permissions (role_id, module_id, can_create, can_read, can_update, can_delete)
SELECT r.id, m.id, 1, 1, 1, 1 FROM roles r CROSS JOIN modules m WHERE r.code = 'super_admin';

-- Institution Admin: every action on the setup, reads users
INSERT INTO role_module_permissions (role_id, module_id, can_create, can_read, can_update, can_delete)
SELECT r.id, m.id, m.code <> 'users', 1, m.code <> 'users', m.code <> 'users'
FROM roles r CROSS JOIN modules m WHERE r.code = 'institution_admin';

-- Admissions Officer: creates and updates programs and templates (no delete), reads campuses and eligibility
INSERT INTO role_module_permissions (role_id, module_id, can_create, can_read, can_update, can_delete)
SELECT r.id, m.id, m.code IN ('programs', 'letter_templates', 'email_templates'), 1,
       m.code IN ('programs', 'letter_templates', 'email_templates'), 0
FROM roles r CROSS JOIN modules m WHERE r.code = 'admissions_officer' AND m.code <> 'users';

-- Reviewer and Read Only: read every module except users
INSERT INTO role_module_permissions (role_id, module_id, can_create, can_read, can_update, can_delete)
SELECT r.id, m.id, 0, 1, 0, 0 FROM roles r CROSS JOIN modules m WHERE r.code IN ('reviewer', 'read_only') AND m.code <> 'users';

ALTER TABLE users ADD COLUMN role_id INT NULL AFTER password_hash;

UPDATE users u
JOIN roles r ON r.code = IF(u.role = 'admin', 'super_admin', 'admissions_officer')
SET u.role_id = r.id;

ALTER TABLE users
    MODIFY role_id INT NOT NULL,
    ADD CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles (id),
    DROP COLUMN role;
