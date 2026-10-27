CREATE TABLE tenants (
    id            INT          NOT NULL AUTO_INCREMENT,
    name          VARCHAR(150) NOT NULL,
    code          VARCHAR(20)  NULL,
    contact_email VARCHAR(255) NULL,
    phone         VARCHAR(30)  NULL,
    address       VARCHAR(500) NULL,
    website       VARCHAR(255) NULL,
    logo_storage_key VARCHAR(500) NULL,
    brand_color   CHAR(7)      NULL,
    is_platform   TINYINT(1)   NOT NULL DEFAULT 0,
    status        ENUM('active', 'blocked') NOT NULL DEFAULT 'active',
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at    DATETIME     NULL,
    not_deleted   TINYINT      GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_tenants_code (code, not_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
    ('applications',     'Applications',     5),
    ('reviews',          'Manual Review',    7),
    ('letters',          'Letters',          8),
    ('communications',   'Communications',   9),
    ('programs',         'Programs',         10),
    ('campuses',         'Campuses',         20),
    ('letter_templates', 'Letter Templates', 30),
    ('email_templates',  'Email Templates',  40),
    ('eligibility',      'Eligibility',      50),
    ('users',            'Users',            60),
    ('roles',            'Roles & Permissions', 65),
    ('settings',         'Settings',         68),
    ('ai_usage',         'AI Usage',         69),
    ('audit_logs',       'Audit Logs',       70);

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

INSERT INTO role_module_permissions (role_id, module_id, can_create, can_read, can_update, can_delete)
SELECT r.id, m.id, 1, 1, 1, 1 FROM roles r CROSS JOIN modules m WHERE r.code = 'super_admin' AND m.code NOT IN ('reviews', 'letters', 'communications', 'roles', 'settings', 'ai_usage', 'audit_logs');

INSERT INTO role_module_permissions (role_id, module_id, can_create, can_read, can_update, can_delete)
SELECT r.id, m.id, m.code <> 'users', 1, m.code <> 'users', m.code <> 'users'
FROM roles r CROSS JOIN modules m WHERE r.code = 'institution_admin' AND m.code NOT IN ('reviews', 'letters', 'communications', 'roles', 'settings', 'ai_usage', 'audit_logs');

INSERT INTO role_module_permissions (role_id, module_id, can_create, can_read, can_update, can_delete)
SELECT r.id, m.id, m.code IN ('applications', 'programs', 'letter_templates', 'email_templates'), 1,
       m.code IN ('applications', 'programs', 'letter_templates', 'email_templates'), m.code = 'applications'
FROM roles r CROSS JOIN modules m WHERE r.code = 'admissions_officer' AND m.code NOT IN ('reviews', 'letters', 'communications', 'users', 'roles', 'settings', 'ai_usage', 'audit_logs');

INSERT INTO role_module_permissions (role_id, module_id, can_create, can_read, can_update, can_delete)
SELECT r.id, m.id, 0, 1, 0, 0 FROM roles r CROSS JOIN modules m WHERE r.code IN ('reviewer', 'read_only') AND m.code NOT IN ('reviews', 'letters', 'communications', 'users', 'roles', 'settings', 'ai_usage', 'audit_logs');

INSERT INTO role_module_permissions (role_id, module_id, can_create, can_read, can_update, can_delete)
SELECT r.id, m.id, 0, 1, 0, 0 FROM roles r JOIN modules m ON m.code = 'audit_logs';

INSERT INTO role_module_permissions (role_id, module_id, can_create, can_read, can_update, can_delete)
SELECT r.id, m.id, 0, 1, r.code = 'super_admin', 0
FROM roles r JOIN modules m ON m.code = 'roles' WHERE r.code IN ('super_admin', 'institution_admin');

INSERT INTO role_module_permissions (role_id, module_id, can_create, can_read, can_update, can_delete)
SELECT r.id, m.id, 0, 1, r.code = 'super_admin', 0
FROM roles r JOIN modules m ON m.code = 'settings' WHERE r.code IN ('super_admin', 'institution_admin');

INSERT INTO role_module_permissions (role_id, module_id, can_create, can_read, can_update, can_delete)
SELECT r.id, m.id, 0, 1, r.code <> 'read_only', 0 FROM roles r JOIN modules m ON m.code = 'reviews';

INSERT INTO role_module_permissions (role_id, module_id, can_create, can_read, can_update, can_delete)
SELECT r.id, m.id, 0, 1, 0, 0 FROM roles r JOIN modules m ON m.code = 'ai_usage' WHERE r.code IN ('super_admin', 'institution_admin');

INSERT INTO role_module_permissions (role_id, module_id, can_create, can_read, can_update, can_delete)
SELECT r.id, m.id,
       r.code IN ('super_admin', 'institution_admin', 'admissions_officer'),
       1,
       r.code IN ('super_admin', 'institution_admin'),
       0
FROM roles r JOIN modules m ON m.code = 'letters';

INSERT INTO role_module_permissions (role_id, module_id, can_create, can_read, can_update, can_delete)
SELECT r.id, m.id,
       r.code IN ('super_admin', 'institution_admin', 'admissions_officer'),
       1,
       r.code IN ('super_admin', 'institution_admin', 'admissions_officer'),
       0
FROM roles r JOIN modules m ON m.code = 'communications';

CREATE TABLE users (
    id              INT          NOT NULL AUTO_INCREMENT,
    tenant_id       INT          NOT NULL,
    name            VARCHAR(150) NOT NULL,
    email           VARCHAR(255) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role_id         INT          NOT NULL,
    status          ENUM('active', 'inactive', 'banned', 'blocked', 'deactivated', 'deleted') NOT NULL DEFAULT 'inactive',
    last_login_at   DATETIME     NULL,
    token_version   INT          NOT NULL DEFAULT 0,
    password_changed_at DATETIME NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at      DATETIME     NULL,
    not_deleted     TINYINT      GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_users_tenant_id (tenant_id, id),
    UNIQUE KEY uq_users_email (email, not_deleted),
    CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE countries (
    id              INT          NOT NULL AUTO_INCREMENT,
    name            VARCHAR(100) NOT NULL,
    iso2            CHAR(2)      NOT NULL,
    phone_code      VARCHAR(20)  NULL,
    currency_code   CHAR(3)      NULL,
    deleted_at      DATETIME     NULL,
    not_deleted     TINYINT      GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_countries_iso2 (iso2, not_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE states (
    id          INT          NOT NULL AUTO_INCREMENT,
    country_id  INT          NOT NULL,
    name        VARCHAR(100) NOT NULL,
    code        VARCHAR(10)  NOT NULL,
    deleted_at  DATETIME     NULL,
    not_deleted TINYINT      GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_states_country_code (country_id, code, not_deleted),
    CONSTRAINT fk_states_country FOREIGN KEY (country_id) REFERENCES countries (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cities (
    id          INT          NOT NULL AUTO_INCREMENT,
    state_id    INT          NOT NULL,
    name        VARCHAR(150) NOT NULL,
    deleted_at  DATETIME     NULL,
    not_deleted TINYINT      GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_cities_state_name (state_id, name, not_deleted),
    CONSTRAINT fk_cities_state FOREIGN KEY (state_id) REFERENCES states (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE campuses (
    id          INT          NOT NULL AUTO_INCREMENT,
    tenant_id   INT          NOT NULL,
    name        VARCHAR(150) NOT NULL,
    city_id     INT          NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at  DATETIME     NULL,
    not_deleted TINYINT      GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_campuses_tenant_id (tenant_id, id),
    UNIQUE KEY uq_campuses_tenant_name_city (tenant_id, name, city_id, not_deleted),
    CONSTRAINT fk_campuses_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_campuses_city FOREIGN KEY (city_id) REFERENCES cities (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE letter_variables (
    id          INT          NOT NULL AUTO_INCREMENT,
    name        VARCHAR(50)  NOT NULL,
    label       VARCHAR(100) NOT NULL,
    sort_order  INT          NOT NULL DEFAULT 0,
    deleted_at  DATETIME     NULL,
    not_deleted TINYINT      GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_letter_variables_name (name, not_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO letter_variables (name, label, sort_order) VALUES
    ('student_full_name',   'Student Full Name',    10),
    ('application_number',  'Application Number',   20),
    ('student_email',       'Student Email',        30),
    ('program_name',        'Program Name',         40),
    ('program_code',        'Program Code',         50),
    ('campus',              'Campus',               60),
    ('intake',              'Intake',               70),
    ('application_date',    'Application Date',     80),
    ('decision_date',       'Decision Date',        90),
    ('offer_expiry_date',   'Offer Expiry Date',    100),
    ('institution_name',    'Institution Name',     110),
    ('institution_address', 'Institution Address',  120),
    ('institution_website', 'Institution Website',  125),
    ('eligibility_table',   'Eligibility Table',    130),
    ('document_checklist',  'Document Checklist',   135),
    ('conditions',          'Conditions',           140),
    ('unmet_requirements',  'Unmet Requirements',   150),
    ('missing_documents',   'Missing Documents',    160),
    ('signatory_name',      'Authorized Signatory', 170),
    ('signatory_title',     'Signatory Title',      180);

CREATE TABLE document_types (
    id          INT          NOT NULL AUTO_INCREMENT,
    code        VARCHAR(50)  NOT NULL,
    label       VARCHAR(100) NOT NULL,
    sort_order  INT          NOT NULL DEFAULT 0,
    deleted_at  DATETIME     NULL,
    not_deleted TINYINT      GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_document_types_code (code, not_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO document_types (code, label, sort_order) VALUES
    ('passport',                     'Passport',                     10),
    ('academic_transcript',          'Academic Transcript',          20),
    ('degree_certificate',           'Degree Certificate',           30),
    ('english_language_certificate', 'English Language Certificate', 40),
    ('cv_resume',                    'CV / Resume',                  50),
    ('statement_of_purpose',         'Statement of Purpose',         60),
    ('recommendation_letter',        'Recommendation Letter',        70),
    ('work_experience_letter',       'Work Experience Letter',       80),
    ('financial_document',           'Financial Document',           90),
    ('application_form',             'Application Form',             100),
    ('other',                        'Other',                        110);

CREATE TABLE eligibility_categories (
    id          INT          NOT NULL AUTO_INCREMENT,
    code        VARCHAR(50)  NOT NULL,
    label       VARCHAR(100) NOT NULL,
    sort_order  INT          NOT NULL DEFAULT 0,
    deleted_at  DATETIME     NULL,
    not_deleted TINYINT      GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_eligibility_categories_code (code, not_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO eligibility_categories (code, label, sort_order) VALUES
    ('academic_qualification', 'Academic Qualification', 10),
    ('english_proficiency',    'English Proficiency',    20),
    ('work_experience',        'Work Experience',        30),
    ('financial',              'Financial',              40),
    ('age',                    'Age',                    50),
    ('nationality',            'Nationality / Residency', 60),
    ('other',                  'Other',                  70);

CREATE TABLE eligibility_sets (
    id          INT          NOT NULL AUTO_INCREMENT,
    tenant_id   INT          NOT NULL,
    name        VARCHAR(150) NOT NULL,
    description TEXT         NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at  DATETIME     NULL,
    not_deleted TINYINT      GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_eligibility_sets_tenant_id (tenant_id, id),
    UNIQUE KEY uq_eligibility_sets_tenant_name (tenant_id, name, not_deleted),
    CONSTRAINT fk_eligibility_sets_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE eligibility_set_versions (
    id                  INT      NOT NULL AUTO_INCREMENT,
    eligibility_set_id  INT      NOT NULL,
    version_number      INT      NOT NULL,
    status              ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
    published_at        DATETIME NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at          DATETIME NULL,
    not_deleted         TINYINT  GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,
    live_published      TINYINT  GENERATED ALWAYS AS (IF(status = 'published' AND deleted_at IS NULL, 1, NULL)) VIRTUAL,
    live_draft          TINYINT  GENERATED ALWAYS AS (IF(status = 'draft' AND deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_eligibility_set_versions_number (eligibility_set_id, version_number, not_deleted),
    UNIQUE KEY uq_eligibility_set_versions_published (eligibility_set_id, live_published),
    UNIQUE KEY uq_eligibility_set_versions_draft (eligibility_set_id, live_draft),
    CONSTRAINT fk_eligibility_set_versions_set FOREIGN KEY (eligibility_set_id) REFERENCES eligibility_sets (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE eligibility_criteria (
    id                     INT          NOT NULL AUTO_INCREMENT,
    version_id             INT          NOT NULL,
    name                   VARCHAR(150) NOT NULL,
    category_id            INT          NOT NULL,
    description            TEXT         NULL,
    data_type              ENUM('text', 'number', 'boolean', 'date') NOT NULL,
    operator               ENUM('equal_to', 'not_equal_to', 'greater_than', 'greater_than_or_equal', 'less_than',
                                'less_than_or_equal', 'between', 'one_of', 'contains') NOT NULL,
    unit                   VARCHAR(50)  NULL,
    required_value         VARCHAR(255) NOT NULL,
    evidence_instructions  TEXT         NULL,
    rejection_reason       VARCHAR(255) NULL,
    is_mandatory           TINYINT(1)   NOT NULL DEFAULT 1,
    effective_date         DATE         NULL,
    expiry_date            DATE         NULL,
    sort_order             INT          NOT NULL DEFAULT 0,
    created_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at             DATETIME     NULL,

    PRIMARY KEY (id),
    KEY idx_eligibility_criteria_version (version_id, sort_order),
    CONSTRAINT fk_eligibility_criteria_version FOREIGN KEY (version_id) REFERENCES eligibility_set_versions (id) ON DELETE CASCADE,
    CONSTRAINT fk_eligibility_criteria_category FOREIGN KEY (category_id) REFERENCES eligibility_categories (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE eligibility_criterion_documents (
    id                INT      NOT NULL AUTO_INCREMENT,
    criterion_id      INT      NOT NULL,
    document_type_id  INT      NOT NULL,
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at        DATETIME NULL,
    not_deleted       TINYINT  GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_eligibility_criterion_documents (criterion_id, document_type_id, not_deleted),
    CONSTRAINT fk_eligibility_criterion_documents_criterion FOREIGN KEY (criterion_id) REFERENCES eligibility_criteria (id) ON DELETE CASCADE,
    CONSTRAINT fk_eligibility_criterion_documents_type FOREIGN KEY (document_type_id) REFERENCES document_types (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE eligibility_document_requirements (
    id                INT          NOT NULL AUTO_INCREMENT,
    version_id        INT          NOT NULL,
    document_type_id  INT          NOT NULL,
    custom_label      VARCHAR(150) NULL,
    instructions      VARCHAR(500) NULL,
    is_required       TINYINT(1)   NOT NULL DEFAULT 1,
    sort_order        INT          NOT NULL DEFAULT 0,
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at        DATETIME     NULL,
    not_deleted       TINYINT      GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_eligibility_document_requirements_type (version_id, document_type_id, not_deleted),
    CONSTRAINT fk_eligibility_document_requirements_version FOREIGN KEY (version_id) REFERENCES eligibility_set_versions (id) ON DELETE CASCADE,
    CONSTRAINT fk_eligibility_document_requirements_type FOREIGN KEY (document_type_id) REFERENCES document_types (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE letter_templates (
    id                INT          NOT NULL AUTO_INCREMENT,
    tenant_id         INT          NOT NULL,
    name              VARCHAR(150) NOT NULL,
    letter_type       ENUM('conditional_offer', 'rejection', 'manual_review') NOT NULL,
    subject           VARCHAR(255) NULL,
    reference_prefix  VARCHAR(10)  NOT NULL DEFAULT 'LTR',
    body              MEDIUMTEXT   NOT NULL,
    signatory_name    VARCHAR(150) NULL,
    signatory_title   VARCHAR(150) NULL,
    header_html       TEXT         NULL,
    footer_html       TEXT         NULL,
    status            ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at        DATETIME     NULL,
    not_deleted       TINYINT      GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_letter_templates_tenant_id (tenant_id, id),
    UNIQUE KEY uq_letter_templates_tenant_name (tenant_id, name, not_deleted),
    KEY idx_letter_templates_tenant_type (tenant_id, letter_type),
    CONSTRAINT fk_letter_templates_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE email_templates (
    id                 INT           NOT NULL AUTO_INCREMENT,
    tenant_id          INT           NOT NULL,
    name               VARCHAR(150)  NOT NULL,
    email_type         ENUM('conditional_offer', 'rejection', 'manual_review', 'document_request', 'custom') NOT NULL,
    subject            VARCHAR(255)  NULL,
    cc                 VARCHAR(1000) NULL,
    bcc                VARCHAR(1000) NULL,
    body               MEDIUMTEXT    NOT NULL,
    attach_pdf_letter  TINYINT(1)    NOT NULL DEFAULT 0,
    status             ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
    created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at         DATETIME      NULL,
    not_deleted        TINYINT       GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_email_templates_tenant_id (tenant_id, id),
    UNIQUE KEY uq_email_templates_tenant_name (tenant_id, name, not_deleted),
    KEY idx_email_templates_tenant_type (tenant_id, email_type),
    CONSTRAINT fk_email_templates_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE programs (
    id                              INT          NOT NULL AUTO_INCREMENT,
    tenant_id                       INT          NOT NULL,
    name                            VARCHAR(150) NOT NULL,
    code                            VARCHAR(50)  NOT NULL,
    award_level                     VARCHAR(100) NULL,
    campus_id                       INT          NULL,
    eligibility_set_id              INT          NULL,
    duration                        VARCHAR(50)  NULL,
    study_mode                      ENUM('full_time', 'part_time', 'online', 'hybrid') NOT NULL DEFAULT 'full_time',
    application_deadline            DATE         NULL,
    status                          ENUM('draft', 'active', 'inactive', 'archived')    NOT NULL DEFAULT 'draft',
    description                     TEXT         NULL,

    conditional_offer_template_id   INT          NULL,
    rejection_template_id           INT          NULL,
    manual_review_template_id       INT          NULL,

    offer_email_template_id         INT          NULL,
    rejection_email_template_id     INT          NULL,

    created_at                      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at                      DATETIME     NULL,
    not_deleted                     TINYINT      GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_programs_tenant_id (tenant_id, id),
    UNIQUE KEY uq_programs_tenant_code (tenant_id, code, not_deleted),
    CONSTRAINT fk_programs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_programs_campus FOREIGN KEY (tenant_id, campus_id) REFERENCES campuses (tenant_id, id),
    CONSTRAINT fk_programs_eligibility_set FOREIGN KEY (tenant_id, eligibility_set_id) REFERENCES eligibility_sets (tenant_id, id),
    CONSTRAINT fk_programs_conditional_offer_template FOREIGN KEY (tenant_id, conditional_offer_template_id) REFERENCES letter_templates (tenant_id, id),
    CONSTRAINT fk_programs_rejection_template FOREIGN KEY (tenant_id, rejection_template_id) REFERENCES letter_templates (tenant_id, id),
    CONSTRAINT fk_programs_manual_review_template FOREIGN KEY (tenant_id, manual_review_template_id) REFERENCES letter_templates (tenant_id, id),
    CONSTRAINT fk_programs_offer_email_template FOREIGN KEY (tenant_id, offer_email_template_id) REFERENCES email_templates (tenant_id, id),
    CONSTRAINT fk_programs_rejection_email_template FOREIGN KEY (tenant_id, rejection_email_template_id) REFERENCES email_templates (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

CREATE TABLE ai_providers (
    id           INT          NOT NULL AUTO_INCREMENT,
    code         VARCHAR(50)  NOT NULL,
    name         VARCHAR(100) NOT NULL,
    is_available TINYINT(1)   NOT NULL DEFAULT 0,
    sort_order   INT          NOT NULL DEFAULT 0,
    deleted_at   DATETIME     NULL,
    not_deleted  TINYINT      GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_ai_providers_code (code, not_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO ai_providers (code, name, is_available, sort_order) VALUES
    ('openai',    'OpenAI (ChatGPT)',   1, 10),
    ('anthropic', 'Anthropic (Claude)', 0, 20);

CREATE TABLE ai_models (
    id          INT          NOT NULL AUTO_INCREMENT,
    provider_id INT          NOT NULL,
    code        VARCHAR(100) NOT NULL,
    name        VARCHAR(100) NOT NULL,
    description VARCHAR(255) NULL,
    input_price_per_1m DECIMAL(10,4) NULL,
    cached_input_price_per_1m DECIMAL(10,4) NULL,
    output_price_per_1m DECIMAL(10,4) NULL,
    sort_order  INT          NOT NULL DEFAULT 0,
    deleted_at  DATETIME     NULL,
    not_deleted TINYINT      GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_ai_models_code (code, not_deleted),
    KEY idx_ai_models_provider (provider_id),
    CONSTRAINT fk_ai_models_provider FOREIGN KEY (provider_id) REFERENCES ai_providers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO ai_models (provider_id, code, name, description, input_price_per_1m, cached_input_price_per_1m, output_price_per_1m, sort_order) VALUES
    (1, 'gpt-5.6-luna',      'GPT-5.6 Luna',      'Fast, cost-effective',    0.2000, 0.0200,  1.2000,  10),
    (1, 'gpt-5.6-terra',     'GPT-5.6 Terra',     'Balanced, recommended',   2.0000, 0.2000, 12.0000,  20),
    (1, 'gpt-5.6-sol',       'GPT-5.6 Sol',       'Flagship, complex cases', 4.0000, 0.4000, 20.0000,  30),
    (2, 'claude-haiku-5-5',  'Claude Haiku 5.5',  'Fast, cost-effective',    0.1000, 0.0100,  0.5000, 110),
    (2, 'claude-sonnet-5-5', 'Claude Sonnet 5.5', 'Balanced, recommended',   2.0000, 0.1000, 10.0000, 120),
    (2, 'claude-opus-5-5',   'Claude Opus 5.5',   'Flagship, complex cases', 4.0000, 0.2000, 20.0000, 130);

CREATE TABLE tenant_settings (
    id                              INT          NOT NULL AUTO_INCREMENT,
    tenant_id                       INT          NOT NULL,
    auto_assessment                 TINYINT(1)   NOT NULL DEFAULT 1,
    auto_letter_generation          TINYINT(1)   NOT NULL DEFAULT 1,
    auto_email_dispatch             TINYINT(1)   NOT NULL DEFAULT 0,
    auto_approve_offers             TINYINT(1)   NOT NULL DEFAULT 0,
    auto_approve_rejections         TINYINT(1)   NOT NULL DEFAULT 0,
    require_rejection_approval      TINYINT(1)   NOT NULL DEFAULT 1,
    require_manual_review_edge_cases TINYINT(1)  NOT NULL DEFAULT 1,
    flag_low_confidence             TINYINT(1)   NOT NULL DEFAULT 1,
    flag_missing_documents          TINYINT(1)   NOT NULL DEFAULT 1,
    offer_confidence_threshold      DECIMAL(3,2) NOT NULL DEFAULT 0.85,
    rejection_confidence_threshold  DECIMAL(3,2) NOT NULL DEFAULT 0.90,
    default_reviewer_id             INT          NULL,
    email_max_retries               TINYINT      NOT NULL DEFAULT 3,
    smtp_enabled                    TINYINT(1)   NOT NULL DEFAULT 0,
    smtp_host                       VARCHAR(255) NULL,
    smtp_port                       INT          NULL,
    smtp_secure                     TINYINT(1)   NOT NULL DEFAULT 0,
    smtp_user                       VARCHAR(255) NULL,
    smtp_password_encrypted         TEXT         NULL,
    smtp_from_email                 VARCHAR(255) NULL,
    smtp_from_name                  VARCHAR(150) NULL,
    extraction_model_id             INT          NOT NULL,
    extraction_fallback_model_id    INT          NOT NULL,
    assessment_model_id             INT          NOT NULL,
    assessment_escalation_model_id  INT          NOT NULL,
    verify_document_type            TINYINT(1)   NOT NULL DEFAULT 1,
    extraction_prompt               TEXT         NULL,
    assessment_prompt               TEXT         NULL,
    openai_api_key_encrypted        TEXT         NULL,
    openai_api_key_last4            VARCHAR(4)   NULL,
    created_at                      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at                      DATETIME     NULL,
    not_deleted                     TINYINT      GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_tenant_settings_tenant (tenant_id, not_deleted),
    CONSTRAINT fk_tenant_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_tenant_settings_reviewer FOREIGN KEY (tenant_id, default_reviewer_id) REFERENCES users (tenant_id, id),
    CONSTRAINT fk_tenant_settings_extraction_model FOREIGN KEY (extraction_model_id) REFERENCES ai_models (id),
    CONSTRAINT fk_tenant_settings_extraction_fallback_model FOREIGN KEY (extraction_fallback_model_id) REFERENCES ai_models (id),
    CONSTRAINT fk_tenant_settings_assessment_model FOREIGN KEY (assessment_model_id) REFERENCES ai_models (id),
    CONSTRAINT fk_tenant_settings_assessment_escalation_model FOREIGN KEY (assessment_escalation_model_id) REFERENCES ai_models (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE students (
    id                   INT          NOT NULL AUTO_INCREMENT,
    tenant_id            INT          NOT NULL,
    first_name           VARCHAR(100) NOT NULL,
    middle_name          VARCHAR(100) NULL,
    last_name            VARCHAR(100) NOT NULL,
    date_of_birth        DATE         NULL,
    gender               ENUM('male', 'female', 'other', 'prefer_not_to_say') NULL,
    nationality_id       INT          NULL,
    residence_country_id INT          NULL,
    passport_number      VARCHAR(50)  NULL,
    email                VARCHAR(255) NOT NULL,
    phone                VARCHAR(30)  NULL,
    address              VARCHAR(500) NULL,
    created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at           DATETIME     NULL,
    not_deleted          TINYINT      GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_students_tenant_id (tenant_id, id),
    UNIQUE KEY uq_students_tenant_email (tenant_id, email, not_deleted),
    CONSTRAINT fk_students_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_students_nationality FOREIGN KEY (nationality_id) REFERENCES countries (id),
    CONSTRAINT fk_students_residence_country FOREIGN KEY (residence_country_id) REFERENCES countries (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE applications (
    id                     INT        NOT NULL AUTO_INCREMENT,
    tenant_id              INT        NOT NULL,
    application_number     VARCHAR(20) NOT NULL,
    student_id             INT        NOT NULL,
    program_id             INT        NOT NULL,
    intake_term            ENUM('spring', 'summer', 'fall', 'winter') NOT NULL,
    intake_year            SMALLINT   NOT NULL,
    study_mode             ENUM('full_time', 'part_time', 'online', 'hybrid') NOT NULL,
    application_date       DATE       NOT NULL,
    status                 ENUM('draft', 'submitted', 'processing', 'manual_review', 'completed') NOT NULL DEFAULT 'draft',
    assessment_status      ENUM('pending', 'in_progress', 'completed', 'failed') NULL,
    outcome                ENUM('conditional_offer', 'rejection', 'manual_review') NULL,
    confidence             DECIMAL(3,2) NULL,
    decision_source        ENUM('ai', 'manual') NULL,
    decided_by             INT          NULL,
    decided_at             DATETIME     NULL,
    decision_reason        TEXT         NULL,
    assigned_officer_id    INT        NULL,
    eligibility_version_id INT        NULL,
    submitted_at           DATETIME   NULL,
    submitted_by           INT        NULL,
    created_at             DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at             DATETIME   NULL,
    not_deleted            TINYINT    GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_applications_tenant_id (tenant_id, id),
    UNIQUE KEY uq_applications_tenant_number (tenant_id, application_number, not_deleted),
    UNIQUE KEY uq_applications_student_program_intake (tenant_id, student_id, program_id, intake_term, intake_year, not_deleted),
    KEY idx_applications_tenant_status (tenant_id, status),
    KEY idx_applications_tenant_program (tenant_id, program_id),
    KEY idx_applications_tenant_submitted (tenant_id, submitted_at),
    KEY idx_applications_tenant_assessment (tenant_id, assessment_status),
    CONSTRAINT fk_applications_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_applications_student FOREIGN KEY (tenant_id, student_id) REFERENCES students (tenant_id, id),
    CONSTRAINT fk_applications_program FOREIGN KEY (tenant_id, program_id) REFERENCES programs (tenant_id, id),
    CONSTRAINT fk_applications_assigned_officer FOREIGN KEY (tenant_id, assigned_officer_id) REFERENCES users (tenant_id, id),
    CONSTRAINT fk_applications_eligibility_version FOREIGN KEY (eligibility_version_id) REFERENCES eligibility_set_versions (id),
    CONSTRAINT fk_applications_submitted_by FOREIGN KEY (tenant_id, submitted_by) REFERENCES users (tenant_id, id),
    CONSTRAINT fk_applications_decided_by FOREIGN KEY (tenant_id, decided_by) REFERENCES users (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE application_documents (
    id               INT          NOT NULL AUTO_INCREMENT,
    application_id   INT          NOT NULL,
    document_type_id INT          NOT NULL,
    original_name    VARCHAR(255) NOT NULL,
    storage_key      VARCHAR(500) NOT NULL,
    mime_type        VARCHAR(100) NOT NULL,
    size_bytes       INT          NOT NULL,
    uploaded_by      INT          NULL,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at       DATETIME     NULL,

    PRIMARY KEY (id),
    KEY idx_application_documents_application (application_id),
    CONSTRAINT fk_application_documents_application FOREIGN KEY (application_id) REFERENCES applications (id),
    CONSTRAINT fk_application_documents_type FOREIGN KEY (document_type_id) REFERENCES document_types (id),
    CONSTRAINT fk_application_documents_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE manual_reviews (
    id              INT          NOT NULL AUTO_INCREMENT,
    tenant_id       INT          NOT NULL,
    application_id  INT          NOT NULL,
    status          ENUM('unassigned', 'assigned', 'in_review', 'waiting_documents', 'resolved') NOT NULL DEFAULT 'unassigned',
    priority        ENUM('low', 'normal', 'high', 'urgent') NOT NULL DEFAULT 'normal',
    reason          VARCHAR(500) NULL,
    flags           JSON         NULL,
    queued_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewer_id     INT          NULL,
    assigned_by     INT          NULL,
    assigned_at     DATETIME     NULL,
    assignment_note TEXT         NULL,
    resolution      ENUM('returned_for_reassessment', 'approved', 'rejected') NULL,
    resolution_note TEXT         NULL,
    resolved_by     INT          NULL,
    resolved_at     DATETIME     NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at      DATETIME     NULL,
    open_case       TINYINT      GENERATED ALWAYS AS (IF(status <> 'resolved' AND deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_manual_reviews_tenant_id (tenant_id, id),
    UNIQUE KEY uq_manual_reviews_open_case (application_id, open_case),
    KEY idx_manual_reviews_tenant_status (tenant_id, status, priority),
    KEY idx_manual_reviews_tenant_reviewer (tenant_id, reviewer_id),
    CONSTRAINT fk_manual_reviews_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_manual_reviews_application FOREIGN KEY (tenant_id, application_id) REFERENCES applications (tenant_id, id),
    CONSTRAINT fk_manual_reviews_reviewer FOREIGN KEY (tenant_id, reviewer_id) REFERENCES users (tenant_id, id),
    CONSTRAINT fk_manual_reviews_assigned_by FOREIGN KEY (tenant_id, assigned_by) REFERENCES users (tenant_id, id),
    CONSTRAINT fk_manual_reviews_resolved_by FOREIGN KEY (tenant_id, resolved_by) REFERENCES users (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE application_document_requests (
    id                INT        NOT NULL AUTO_INCREMENT,
    application_id    INT        NOT NULL,
    review_id         INT        NULL,
    document_type_ids JSON       NOT NULL,
    message           TEXT       NULL,
    email_status      ENUM('sent', 'failed', 'not_configured') NOT NULL,
    requested_by      INT        NULL,
    created_at        DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at        DATETIME   NULL,

    PRIMARY KEY (id),
    KEY idx_application_document_requests_application (application_id),
    CONSTRAINT fk_application_document_requests_application FOREIGN KEY (application_id) REFERENCES applications (id),
    CONSTRAINT fk_application_document_requests_review FOREIGN KEY (review_id) REFERENCES manual_reviews (id),
    CONSTRAINT fk_application_document_requests_requested_by FOREIGN KEY (requested_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE application_assessments (
    id                    INT          NOT NULL AUTO_INCREMENT,
    tenant_id             INT          NOT NULL,
    application_id        INT          NOT NULL,
    eligibility_version_id INT         NOT NULL,
    status                ENUM('in_progress', 'completed', 'failed') NOT NULL DEFAULT 'in_progress',
    outcome               ENUM('conditional_offer', 'rejection', 'manual_review') NULL,
    confidence            DECIMAL(3,2) NULL,
    summary               VARCHAR(1000) NULL,
    flags                 JSON         NULL,
    escalated             TINYINT(1)   NOT NULL DEFAULT 0,
    error_message         VARCHAR(500) NULL,
    triggered_by          INT          NULL,
    started_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at          DATETIME     NULL,
    created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at            DATETIME     NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_application_assessments_tenant_id (tenant_id, id),
    KEY idx_application_assessments_tenant_application (tenant_id, application_id),
    KEY idx_application_assessments_status (status),
    CONSTRAINT fk_application_assessments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_application_assessments_application FOREIGN KEY (tenant_id, application_id) REFERENCES applications (tenant_id, id),
    CONSTRAINT fk_application_assessments_version FOREIGN KEY (eligibility_version_id) REFERENCES eligibility_set_versions (id),
    CONSTRAINT fk_application_assessments_triggered_by FOREIGN KEY (tenant_id, triggered_by) REFERENCES users (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE application_document_extractions (
    id               INT          NOT NULL AUTO_INCREMENT,
    assessment_id    INT          NULL,
    document_id      INT          NOT NULL,
    status           ENUM('completed', 'failed', 'unsupported') NOT NULL,
    detected_type    VARCHAR(100) NULL,
    type_matches     TINYINT(1)   NULL,
    fields           JSON         NULL,
    confidence       DECIMAL(3,2) NULL,
    model_code       VARCHAR(100) NULL,
    error_message    VARCHAR(500) NULL,
    requested_by     INT          NULL,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at       DATETIME     NULL,

    PRIMARY KEY (id),
    KEY idx_application_document_extractions_assessment (assessment_id),
    KEY idx_application_document_extractions_document (document_id),
    CONSTRAINT fk_application_document_extractions_assessment FOREIGN KEY (assessment_id) REFERENCES application_assessments (id),
    CONSTRAINT fk_application_document_extractions_document FOREIGN KEY (document_id) REFERENCES application_documents (id),
    CONSTRAINT fk_application_document_extractions_requested_by FOREIGN KEY (requested_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE application_assessment_criteria (
    id                 INT          NOT NULL AUTO_INCREMENT,
    assessment_id      INT          NOT NULL,
    criterion_id       INT          NOT NULL,
    criterion_name     VARCHAR(150) NOT NULL,
    is_mandatory       TINYINT(1)   NOT NULL,
    result             ENUM('met', 'not_met', 'unclear') NOT NULL,
    found_value        VARCHAR(255) NULL,
    evidence           TEXT         NULL,
    source_document_id INT          NULL,
    confidence         DECIMAL(3,2) NULL,
    reasoning          TEXT         NULL,
    override_result    ENUM('met', 'not_met') NULL,
    override_note      TEXT         NULL,
    overridden_by      INT          NULL,
    overridden_at      DATETIME     NULL,
    created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at         DATETIME     NULL,
    not_deleted        TINYINT      GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_application_assessment_criteria_criterion (assessment_id, criterion_id, not_deleted),
    KEY idx_application_assessment_criteria_assessment (assessment_id),
    CONSTRAINT fk_application_assessment_criteria_assessment FOREIGN KEY (assessment_id) REFERENCES application_assessments (id),
    CONSTRAINT fk_application_assessment_criteria_criterion FOREIGN KEY (criterion_id) REFERENCES eligibility_criteria (id),
    CONSTRAINT fk_application_assessment_criteria_document FOREIGN KEY (source_document_id) REFERENCES application_documents (id),
    CONSTRAINT fk_application_assessment_criteria_overridden_by FOREIGN KEY (overridden_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ai_usage_logs (
    id                  BIGINT        NOT NULL AUTO_INCREMENT,
    tenant_id           INT           NOT NULL,
    application_id      INT           NULL,
    document_id         INT           NULL,
    assessment_id       INT           NULL,
    operation           ENUM('extraction', 'extraction_fallback', 'document_verification', 'assessment', 'assessment_escalation') NOT NULL,
    model_id            INT           NULL,
    model_code          VARCHAR(100)  NOT NULL,
    input_tokens        INT           NOT NULL DEFAULT 0,
    cached_input_tokens INT           NOT NULL DEFAULT 0,
    output_tokens       INT           NOT NULL DEFAULT 0,
    cost_usd            DECIMAL(12,6) NULL,
    duration_ms         INT           NULL,
    status              ENUM('success', 'failed') NOT NULL,
    error_message       VARCHAR(500)  NULL,
    provider_request_id VARCHAR(128)  NULL,
    triggered_by        INT           NULL,
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at          DATETIME      NULL,

    PRIMARY KEY (id),
    KEY idx_ai_usage_logs_tenant_created (tenant_id, created_at),
    KEY idx_ai_usage_logs_tenant_application (tenant_id, application_id),
    KEY idx_ai_usage_logs_tenant_model (tenant_id, model_id, created_at),
    KEY idx_ai_usage_logs_assessment (assessment_id),
    CONSTRAINT fk_ai_usage_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_ai_usage_logs_application FOREIGN KEY (tenant_id, application_id) REFERENCES applications (tenant_id, id),
    CONSTRAINT fk_ai_usage_logs_document FOREIGN KEY (document_id) REFERENCES application_documents (id),
    CONSTRAINT fk_ai_usage_logs_assessment FOREIGN KEY (tenant_id, assessment_id) REFERENCES application_assessments (tenant_id, id),
    CONSTRAINT fk_ai_usage_logs_model FOREIGN KEY (model_id) REFERENCES ai_models (id),
    CONSTRAINT fk_ai_usage_logs_triggered_by FOREIGN KEY (tenant_id, triggered_by) REFERENCES users (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
    CONSTRAINT fk_password_resets_user FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

CREATE TABLE application_notes (
    id              INT          NOT NULL AUTO_INCREMENT,
    tenant_id       INT          NOT NULL,
    application_id  INT          NOT NULL,
    review_id       INT          NULL,
    note            TEXT         NOT NULL,
    created_by      INT          NOT NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at      DATETIME     NULL,

    PRIMARY KEY (id),
    KEY idx_application_notes_application (application_id),
    CONSTRAINT fk_application_notes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_application_notes_application FOREIGN KEY (tenant_id, application_id) REFERENCES applications (tenant_id, id),
    CONSTRAINT fk_application_notes_review FOREIGN KEY (tenant_id, review_id) REFERENCES manual_reviews (tenant_id, id),
    CONSTRAINT fk_application_notes_created_by FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE application_letters (
    id                INT          NOT NULL AUTO_INCREMENT,
    tenant_id         INT          NOT NULL,
    application_id    INT          NOT NULL,
    assessment_id     INT          NULL,
    template_id       INT          NULL,
    letter_type       ENUM('conditional_offer', 'rejection', 'manual_review') NOT NULL,
    version           INT          NOT NULL,
    reference_number  VARCHAR(40)  NOT NULL,
    subject           VARCHAR(255) NULL,
    header_html       TEXT         NULL,
    body_html         MEDIUMTEXT   NOT NULL,
    footer_html       TEXT         NULL,
    status            ENUM('pending_approval', 'approved', 'rejected', 'superseded') NOT NULL,
    pdf_storage_key   VARCHAR(500) NOT NULL,
    pdf_size_bytes    INT          NOT NULL,
    generated_by      INT          NULL,
    reviewed_by       INT          NULL,
    reviewed_at       DATETIME     NULL,
    review_note       TEXT         NULL,
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at        DATETIME     NULL,
    not_deleted       TINYINT      GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_application_letters_tenant_id (tenant_id, id),
    UNIQUE KEY uq_application_letters_reference (tenant_id, reference_number, not_deleted),
    UNIQUE KEY uq_application_letters_version (application_id, version, not_deleted),
    KEY idx_application_letters_application (application_id),
    KEY idx_application_letters_tenant_status (tenant_id, status),
    CONSTRAINT fk_application_letters_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_application_letters_application FOREIGN KEY (tenant_id, application_id) REFERENCES applications (tenant_id, id),
    CONSTRAINT fk_application_letters_assessment FOREIGN KEY (tenant_id, assessment_id) REFERENCES application_assessments (tenant_id, id),
    CONSTRAINT fk_application_letters_template FOREIGN KEY (tenant_id, template_id) REFERENCES letter_templates (tenant_id, id),
    CONSTRAINT fk_application_letters_generated_by FOREIGN KEY (tenant_id, generated_by) REFERENCES users (tenant_id, id),
    CONSTRAINT fk_application_letters_reviewed_by FOREIGN KEY (tenant_id, reviewed_by) REFERENCES users (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE application_emails (
    id                  INT           NOT NULL AUTO_INCREMENT,
    tenant_id           INT           NOT NULL,
    application_id      INT           NULL,
    letter_id           INT           NULL,
    template_id         INT           NULL,
    email_type          ENUM('conditional_offer', 'rejection', 'manual_review', 'document_request', 'custom') NOT NULL,
    recipient           VARCHAR(255)  NOT NULL,
    cc                  VARCHAR(1000) NULL,
    bcc                 VARCHAR(1000) NULL,
    subject             VARCHAR(255)  NOT NULL,
    body_html           MEDIUMTEXT    NOT NULL,
    body_text           MEDIUMTEXT    NOT NULL,
    attach_letter       TINYINT(1)    NOT NULL DEFAULT 0,
    status              ENUM('sending', 'sent', 'retrying', 'failed') NOT NULL,
    attempts            INT           NOT NULL DEFAULT 0,
    max_attempts        INT           NOT NULL,
    last_error          VARCHAR(500)  NULL,
    next_retry_at       DATETIME      NULL,
    sent_at             DATETIME      NULL,
    sender              ENUM('custom', 'default') NULL,
    provider_message_id VARCHAR(255)  NULL,
    message_id          VARCHAR(255)  NULL,
    from_email          VARCHAR(255)  NULL,
    reply_to            VARCHAR(255)  NULL,
    sent_by             INT           NULL,
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at          DATETIME      NULL,

    PRIMARY KEY (id),
    KEY idx_application_emails_tenant_status (tenant_id, status),
    KEY idx_application_emails_application (application_id),
    KEY idx_application_emails_letter (letter_id),
    KEY idx_application_emails_retry (status, next_retry_at),
    KEY idx_application_emails_message_id (tenant_id, message_id),
    CONSTRAINT fk_application_emails_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_application_emails_application FOREIGN KEY (tenant_id, application_id) REFERENCES applications (tenant_id, id),
    CONSTRAINT fk_application_emails_letter FOREIGN KEY (tenant_id, letter_id) REFERENCES application_letters (tenant_id, id),
    CONSTRAINT fk_application_emails_template FOREIGN KEY (tenant_id, template_id) REFERENCES email_templates (tenant_id, id),
    CONSTRAINT fk_application_emails_sent_by FOREIGN KEY (tenant_id, sent_by) REFERENCES users (tenant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
