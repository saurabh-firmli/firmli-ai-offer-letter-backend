-- 006: letter templates (conditional offer / rejection / manual review), one set per tenant.
-- A template name is unique inside a tenant. Body, subject, header and footer may use the
-- {{variables}} listed by GET /v1/letter-templates/variables.
-- The three letter template ids on programs now point at real templates; a template used by a
-- program cannot be deleted. All programs had NULL template ids, so the keys apply directly.

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

    PRIMARY KEY (id),
    UNIQUE KEY uq_letter_templates_tenant_name (tenant_id, name),
    KEY idx_letter_templates_tenant_type (tenant_id, letter_type),
    CONSTRAINT fk_letter_templates_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE programs
    ADD CONSTRAINT fk_programs_conditional_offer_template FOREIGN KEY (conditional_offer_template_id) REFERENCES letter_templates (id),
    ADD CONSTRAINT fk_programs_rejection_template FOREIGN KEY (rejection_template_id) REFERENCES letter_templates (id),
    ADD CONSTRAINT fk_programs_manual_review_template FOREIGN KEY (manual_review_template_id) REFERENCES letter_templates (id);
