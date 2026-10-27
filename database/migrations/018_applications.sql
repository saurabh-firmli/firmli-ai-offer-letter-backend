-- 018: applications (the New Application wizard).
--
-- students: one row per student per tenant, found by email, so a student who applies to several
-- programs is stored once. Nationality and country of residence point at the countries list.
--
-- applications: a student's application to a program for an intake (term + year), numbered
-- APP-<8 random digits> (unique per tenant). It starts as a draft (editable, documents can be added)
-- and is submitted once; submitting locks the program's published eligibility version
-- (eligibility_version_id) so later rule changes do not affect it.
-- The same student cannot apply twice to the same program and intake.
-- status: draft -> submitted -> processing -> manual_review / completed.
-- assessment_status, outcome and confidence are filled by the AI assessment (outcome is one of the
-- letter types); assigned_officer_id is the officer handling the application.
--
-- application_documents: uploaded files (PDF, DOCX, JPG, PNG). The file lives in S3 under
-- storage_key; the row keeps its original name, type and size.
--
-- New module "applications": Super Admin, Institution Admin and Admissions Officer may do everything,
-- Reviewer and Read Only may read.

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
    assigned_officer_id    INT        NULL,
    eligibility_version_id INT        NULL,
    submitted_at           DATETIME   NULL,
    submitted_by           INT        NULL,
    created_at             DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at             DATETIME   NULL,
    not_deleted            TINYINT    GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_applications_tenant_number (tenant_id, application_number, not_deleted),
    UNIQUE KEY uq_applications_student_program_intake (tenant_id, student_id, program_id, intake_term, intake_year, not_deleted),
    KEY idx_applications_tenant_status (tenant_id, status),
    KEY idx_applications_tenant_program (tenant_id, program_id),
    CONSTRAINT fk_applications_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_applications_student FOREIGN KEY (student_id) REFERENCES students (id),
    CONSTRAINT fk_applications_program FOREIGN KEY (program_id) REFERENCES programs (id),
    CONSTRAINT fk_applications_assigned_officer FOREIGN KEY (assigned_officer_id) REFERENCES users (id),
    CONSTRAINT fk_applications_eligibility_version FOREIGN KEY (eligibility_version_id) REFERENCES eligibility_set_versions (id),
    CONSTRAINT fk_applications_submitted_by FOREIGN KEY (submitted_by) REFERENCES users (id)
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

INSERT INTO modules (code, name, sort_order) VALUES ('applications', 'Applications', 5);

INSERT INTO role_module_permissions (role_id, module_id, can_create, can_read, can_update, can_delete)
SELECT r.id, m.id, r.code IN ('super_admin', 'institution_admin', 'admissions_officer'), 1,
       r.code IN ('super_admin', 'institution_admin', 'admissions_officer'), r.code IN ('super_admin', 'institution_admin', 'admissions_officer')
FROM roles r JOIN modules m ON m.code = 'applications';
