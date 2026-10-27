-- 023: AI assessment of applications ("Run Assessment").
--
-- application_assessments: one row per run. The AI reads every document of the application, then
-- finds the applicant's value for each eligibility criterion; the backend compares the values with the
-- criteria and decides: conditional_offer, rejection, or manual_review (a Manual Review case opens).
-- status: in_progress -> completed / failed. A failed run can be run again.
--
-- application_document_extractions: what the AI read from each document in a run (detected type,
-- whether it matches the declared type, and the fields with their evidence and confidence).
--
-- application_assessment_criteria: the result for each criterion in a run: the value found, its
-- evidence and source document, and met / not_met / unclear. Name and mandatory flag are copied so
-- the result stays readable when the criterion changes later.
--
-- ai_usage_logs.assessment_id links each AI call to its run, for the cost of a run.

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
    KEY idx_application_assessments_tenant_application (tenant_id, application_id),
    KEY idx_application_assessments_status (status),
    CONSTRAINT fk_application_assessments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_application_assessments_application FOREIGN KEY (application_id) REFERENCES applications (id),
    CONSTRAINT fk_application_assessments_version FOREIGN KEY (eligibility_version_id) REFERENCES eligibility_set_versions (id),
    CONSTRAINT fk_application_assessments_triggered_by FOREIGN KEY (triggered_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE application_document_extractions (
    id               INT          NOT NULL AUTO_INCREMENT,
    assessment_id    INT          NOT NULL,
    document_id      INT          NOT NULL,
    status           ENUM('completed', 'failed', 'unsupported') NOT NULL,
    detected_type    VARCHAR(100) NULL,
    type_matches     TINYINT(1)   NULL,
    fields           JSON         NULL,
    confidence       DECIMAL(3,2) NULL,
    model_code       VARCHAR(100) NULL,
    error_message    VARCHAR(500) NULL,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at       DATETIME     NULL,

    PRIMARY KEY (id),
    KEY idx_application_document_extractions_assessment (assessment_id),
    CONSTRAINT fk_application_document_extractions_assessment FOREIGN KEY (assessment_id) REFERENCES application_assessments (id),
    CONSTRAINT fk_application_document_extractions_document FOREIGN KEY (document_id) REFERENCES application_documents (id)
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
    created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at         DATETIME     NULL,

    PRIMARY KEY (id),
    KEY idx_application_assessment_criteria_assessment (assessment_id),
    CONSTRAINT fk_application_assessment_criteria_assessment FOREIGN KEY (assessment_id) REFERENCES application_assessments (id),
    CONSTRAINT fk_application_assessment_criteria_criterion FOREIGN KEY (criterion_id) REFERENCES eligibility_criteria (id),
    CONSTRAINT fk_application_assessment_criteria_document FOREIGN KEY (source_document_id) REFERENCES application_documents (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE ai_usage_logs
    ADD COLUMN assessment_id INT NULL AFTER document_id,
    ADD KEY idx_ai_usage_logs_assessment (assessment_id),
    ADD CONSTRAINT fk_ai_usage_logs_assessment FOREIGN KEY (assessment_id) REFERENCES application_assessments (id);
