-- 021: AI usage logs: tokens and cost of every AI call (extraction, assessment, ...).
--
-- ai_models gets its prices in USD per 1 million tokens: input, cached input (cheaper re-sent
-- context) and output. NULL = price not known yet; those calls are logged without a cost.
--
-- ai_usage_logs: one row per AI request, written by the AI code. The cost is worked out from the
-- prices at that moment and stored, so a later price change does not rewrite past costs. The model
-- code is kept too, so a log stays readable if the model list changes. Rows are only added.
--
-- New module "ai_usage" (AI Usage), read only: Super Admin and Institution Admin may read it.

ALTER TABLE ai_models
    ADD COLUMN input_price_per_1m DECIMAL(10,4) NULL AFTER description,
    ADD COLUMN cached_input_price_per_1m DECIMAL(10,4) NULL AFTER input_price_per_1m,
    ADD COLUMN output_price_per_1m DECIMAL(10,4) NULL AFTER cached_input_price_per_1m;

CREATE TABLE ai_usage_logs (
    id                  BIGINT        NOT NULL AUTO_INCREMENT,
    tenant_id           INT           NOT NULL,
    application_id      INT           NULL,
    document_id         INT           NULL,
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
    CONSTRAINT fk_ai_usage_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_ai_usage_logs_application FOREIGN KEY (application_id) REFERENCES applications (id),
    CONSTRAINT fk_ai_usage_logs_document FOREIGN KEY (document_id) REFERENCES application_documents (id),
    CONSTRAINT fk_ai_usage_logs_model FOREIGN KEY (model_id) REFERENCES ai_models (id),
    CONSTRAINT fk_ai_usage_logs_triggered_by FOREIGN KEY (triggered_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO modules (code, name, sort_order) VALUES ('ai_usage', 'AI Usage', 69);

INSERT INTO role_module_permissions (role_id, module_id, can_create, can_read, can_update, can_delete)
SELECT r.id, m.id, 0, 1, 0, 0 FROM roles r JOIN modules m ON m.code = 'ai_usage' WHERE r.code IN ('super_admin', 'institution_admin');
