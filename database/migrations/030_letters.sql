-- 030: letters to students (Generate Letter, approval, PDF).
--
-- application_letters: one row per generated letter. The program's template for the outcome is filled with
-- the application's data and saved as it was sent (subject, header, body, footer HTML), with its PDF on S3.
-- reference_number is the template's prefix + the application number's digits + the version, e.g.
-- OFR-37829249-1, unique in the tenant.
-- status: pending_approval -> approved / rejected (by a person, with a note); generating a new letter for the
-- application marks the older ones superseded, so an application has one current letter.
--
-- Module "letters": create = generate, read = see and download, update = approve / reject.
--
-- letter_variables: {{document_checklist}}, the table of required documents and what was received.

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
    UNIQUE KEY uq_application_letters_reference (tenant_id, reference_number, not_deleted),
    KEY idx_application_letters_application (application_id),
    KEY idx_application_letters_tenant_status (tenant_id, status),
    CONSTRAINT fk_application_letters_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_application_letters_application FOREIGN KEY (application_id) REFERENCES applications (id),
    CONSTRAINT fk_application_letters_assessment FOREIGN KEY (assessment_id) REFERENCES application_assessments (id),
    CONSTRAINT fk_application_letters_template FOREIGN KEY (template_id) REFERENCES letter_templates (id),
    CONSTRAINT fk_application_letters_generated_by FOREIGN KEY (generated_by) REFERENCES users (id),
    CONSTRAINT fk_application_letters_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO modules (code, name, sort_order) VALUES ('letters', 'Letters', 8);

INSERT INTO role_module_permissions (role_id, module_id, can_create, can_read, can_update, can_delete)
SELECT r.id, m.id,
       r.code IN ('super_admin', 'institution_admin', 'admissions_officer'),
       1,
       r.code IN ('super_admin', 'institution_admin'),
       0
FROM roles r JOIN modules m ON m.code = 'letters';

INSERT INTO letter_variables (name, label, sort_order) VALUES
    ('document_checklist', 'Document Checklist', 135);
