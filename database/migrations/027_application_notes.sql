-- 027: notes on an application, by officers (application page) and reviewers (Manual Review case).
--
-- review_id is set when the note was added on a Manual Review case. Notes are a record of the work, so they
-- cannot be edited or deleted through the API.

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
    CONSTRAINT fk_application_notes_application FOREIGN KEY (application_id) REFERENCES applications (id),
    CONSTRAINT fk_application_notes_review FOREIGN KEY (review_id) REFERENCES manual_reviews (id),
    CONSTRAINT fk_application_notes_created_by FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
