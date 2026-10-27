-- 031: emails to students (Communications): the decision email with the PDF letter, and the email log.
--
-- application_emails: one row per email to a student, as it was sent (recipient, cc / bcc, subject, body).
-- letter_id: the letter the email is about; attach_letter: its PDF is attached (read from S3 again for a retry).
-- status: sending -> sent; on an error retrying (next_retry_at, waiting longer each time) until max_attempts
-- (1 + Settings emailMaxRetries), then failed. A failed email can be retried by hand.
-- Document request emails from the Manual Review Queue are logged here too.
--
-- Module "communications": create = send, read = the log, update = retry.

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
    sent_by             INT           NULL,
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at          DATETIME      NULL,

    PRIMARY KEY (id),
    KEY idx_application_emails_tenant_status (tenant_id, status),
    KEY idx_application_emails_application (application_id),
    KEY idx_application_emails_letter (letter_id),
    KEY idx_application_emails_retry (status, next_retry_at),
    CONSTRAINT fk_application_emails_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_application_emails_application FOREIGN KEY (application_id) REFERENCES applications (id),
    CONSTRAINT fk_application_emails_letter FOREIGN KEY (letter_id) REFERENCES application_letters (id),
    CONSTRAINT fk_application_emails_template FOREIGN KEY (template_id) REFERENCES email_templates (id),
    CONSTRAINT fk_application_emails_sent_by FOREIGN KEY (sent_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO modules (code, name, sort_order) VALUES ('communications', 'Communications', 9);

INSERT INTO role_module_permissions (role_id, module_id, can_create, can_read, can_update, can_delete)
SELECT r.id, m.id,
       r.code IN ('super_admin', 'institution_admin', 'admissions_officer'),
       1,
       r.code IN ('super_admin', 'institution_admin', 'admissions_officer'),
       0
FROM roles r JOIN modules m ON m.code = 'communications';
