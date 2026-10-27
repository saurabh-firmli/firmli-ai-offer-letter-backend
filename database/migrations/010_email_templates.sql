-- 010: email templates, one set per tenant (name unique inside a tenant, deleted rows ignored).
-- cc / bcc hold comma separated emails. attach_pdf_letter adds the generated PDF letter, so it
-- only makes sense for the types that have a letter (conditional offer, rejection, manual review).
-- The two email template ids on programs now point at real templates; all were NULL before.

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
    UNIQUE KEY uq_email_templates_tenant_name (tenant_id, name, not_deleted),
    KEY idx_email_templates_tenant_type (tenant_id, email_type),
    CONSTRAINT fk_email_templates_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE programs
    ADD CONSTRAINT fk_programs_offer_email_template FOREIGN KEY (offer_email_template_id) REFERENCES email_templates (id),
    ADD CONSTRAINT fk_programs_rejection_email_template FOREIGN KEY (rejection_email_template_id) REFERENCES email_templates (id);
