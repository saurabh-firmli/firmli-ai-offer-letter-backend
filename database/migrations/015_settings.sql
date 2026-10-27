-- 015: organization settings (the Settings page), one set per tenant.
--
-- tenants gets the institution details: code (set by the Firmli team, read only in the app),
-- contact email, phone and address. The code is unique among live tenants.
--
-- ai_models: the AI models the Settings page offers, the same for every tenant (like letter_variables).
-- code is the model id the AI service calls; change the list here, not in the frontend.
--
-- tenant_settings: one row per tenant with automation switches, decision safety rules, the default
-- reviewer, email retries and the AI configuration. Every existing tenant gets a row with the defaults.
-- A NULL custom prompt means "use the built-in prompt".
--
-- New module "settings": Super Admin may read and update it, Institution Admin may read it.

ALTER TABLE tenants
    ADD COLUMN code VARCHAR(20) NULL AFTER name,
    ADD COLUMN contact_email VARCHAR(255) NULL AFTER code,
    ADD COLUMN phone VARCHAR(30) NULL AFTER contact_email,
    ADD COLUMN address VARCHAR(500) NULL AFTER phone,
    ADD COLUMN not_deleted TINYINT GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL AFTER deleted_at,
    ADD UNIQUE KEY uq_tenants_code (code, not_deleted);

CREATE TABLE ai_models (
    id          INT          NOT NULL AUTO_INCREMENT,
    code        VARCHAR(100) NOT NULL,
    name        VARCHAR(100) NOT NULL,
    description VARCHAR(255) NULL,
    sort_order  INT          NOT NULL DEFAULT 0,
    deleted_at  DATETIME     NULL,
    not_deleted TINYINT      GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_ai_models_code (code, not_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO ai_models (code, name, description, sort_order) VALUES
    ('gpt-5.6-luna',  'GPT-5.6 Luna',  'Fast, cost-effective',      10),
    ('gpt-5.6-terra', 'GPT-5.6 Terra', 'Balanced, recommended',     20),
    ('gpt-5.6-sol',   'GPT-5.6 Sol',   'Flagship, complex cases',   30);

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

    extraction_model_id             INT          NOT NULL,
    extraction_fallback_model_id    INT          NOT NULL,
    assessment_model_id             INT          NOT NULL,
    assessment_escalation_model_id  INT          NOT NULL,
    verify_document_type            TINYINT(1)   NOT NULL DEFAULT 1,
    extraction_prompt               TEXT         NULL,
    assessment_prompt               TEXT         NULL,

    created_at                      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at                      DATETIME     NULL,
    not_deleted                     TINYINT      GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_tenant_settings_tenant (tenant_id, not_deleted),
    CONSTRAINT fk_tenant_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_tenant_settings_reviewer FOREIGN KEY (default_reviewer_id) REFERENCES users (id),
    CONSTRAINT fk_tenant_settings_extraction_model FOREIGN KEY (extraction_model_id) REFERENCES ai_models (id),
    CONSTRAINT fk_tenant_settings_extraction_fallback_model FOREIGN KEY (extraction_fallback_model_id) REFERENCES ai_models (id),
    CONSTRAINT fk_tenant_settings_assessment_model FOREIGN KEY (assessment_model_id) REFERENCES ai_models (id),
    CONSTRAINT fk_tenant_settings_assessment_escalation_model FOREIGN KEY (assessment_escalation_model_id) REFERENCES ai_models (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Defaults for the models: Luna extracts, Terra is the fallback and assesses, Sol handles escalations
INSERT INTO tenant_settings (tenant_id, extraction_model_id, extraction_fallback_model_id, assessment_model_id, assessment_escalation_model_id)
SELECT t.id,
       (SELECT id FROM ai_models WHERE code = 'gpt-5.6-luna'),
       (SELECT id FROM ai_models WHERE code = 'gpt-5.6-terra'),
       (SELECT id FROM ai_models WHERE code = 'gpt-5.6-terra'),
       (SELECT id FROM ai_models WHERE code = 'gpt-5.6-sol')
FROM tenants t WHERE t.deleted_at IS NULL;

INSERT INTO modules (code, name, sort_order) VALUES ('settings', 'Settings', 68);

INSERT INTO role_module_permissions (role_id, module_id, can_create, can_read, can_update, can_delete)
SELECT r.id, m.id, 0, 1, r.code = 'super_admin', 0
FROM roles r JOIN modules m ON m.code = 'settings' WHERE r.code IN ('super_admin', 'institution_admin');
