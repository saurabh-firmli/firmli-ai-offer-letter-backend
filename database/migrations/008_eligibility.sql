-- 008: eligibility criteria, reusable across programs.
--
-- An eligibility set (per tenant, e.g. "UK Masters Standard") is assigned to any number of programs
-- (programs.eligibility_set_id). A set has versions: only a draft can be edited; publishing a draft
-- archives the previously published version, so the criteria behind past decisions never change.
-- A version holds the criteria and the document requirements.
--
-- document_types and eligibility_categories are shared by all tenants, like letter_variables.

CREATE TABLE document_types (
    id          INT          NOT NULL AUTO_INCREMENT,
    code        VARCHAR(50)  NOT NULL,
    label       VARCHAR(100) NOT NULL,
    sort_order  INT          NOT NULL DEFAULT 0,

    PRIMARY KEY (id),
    UNIQUE KEY uq_document_types_code (code)
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

    PRIMARY KEY (id),
    UNIQUE KEY uq_eligibility_categories_code (code)
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

    PRIMARY KEY (id),
    UNIQUE KEY uq_eligibility_sets_tenant_name (tenant_id, name),
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

    PRIMARY KEY (id),
    UNIQUE KEY uq_eligibility_set_versions_number (eligibility_set_id, version_number),
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

    PRIMARY KEY (id),
    KEY idx_eligibility_criteria_version (version_id, sort_order),
    CONSTRAINT fk_eligibility_criteria_version FOREIGN KEY (version_id) REFERENCES eligibility_set_versions (id) ON DELETE CASCADE,
    CONSTRAINT fk_eligibility_criteria_category FOREIGN KEY (category_id) REFERENCES eligibility_categories (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The documents the AI should check for a criterion
CREATE TABLE eligibility_criterion_documents (
    criterion_id      INT NOT NULL,
    document_type_id  INT NOT NULL,

    PRIMARY KEY (criterion_id, document_type_id),
    CONSTRAINT fk_eligibility_criterion_documents_criterion FOREIGN KEY (criterion_id) REFERENCES eligibility_criteria (id) ON DELETE CASCADE,
    CONSTRAINT fk_eligibility_criterion_documents_type FOREIGN KEY (document_type_id) REFERENCES document_types (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The documents students see on the application form, once per document type in a version
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

    PRIMARY KEY (id),
    UNIQUE KEY uq_eligibility_document_requirements_type (version_id, document_type_id),
    CONSTRAINT fk_eligibility_document_requirements_version FOREIGN KEY (version_id) REFERENCES eligibility_set_versions (id) ON DELETE CASCADE,
    CONSTRAINT fk_eligibility_document_requirements_type FOREIGN KEY (document_type_id) REFERENCES document_types (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A set still assigned to programs cannot be deleted
ALTER TABLE programs
    ADD COLUMN eligibility_set_id INT NULL AFTER campus_id,
    ADD CONSTRAINT fk_programs_eligibility_set FOREIGN KEY (eligibility_set_id) REFERENCES eligibility_sets (id);
