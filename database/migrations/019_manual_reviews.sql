-- 019: the Manual Review Queue.
--
-- manual_reviews: one review case per application that needs a human (application status
-- manual_review). The AI assessment opens it with a reason, flags and a priority; with a default
-- reviewer in Settings it starts assigned. status: unassigned -> assigned -> in_review -> resolved.
-- An application has at most one open (not resolved) case: open_case is 1 while open, NULL once
-- resolved or deleted, and is part of a unique key, the same idea as not_deleted.
-- Resolving: "Return for reassessment" sends the application back to the AI (resolution
-- returned_for_reassessment).
--
-- application_document_requests: "Request documents" from a review: which document types, the
-- message, and whether the email to the student went out.
--
-- New module "reviews" (Manual Review) with read and update only: every role but Read Only may
-- work the queue; Read Only may look at it.
-- Applications already in manual_review get an open case now.

CREATE TABLE manual_reviews (
    id              INT          NOT NULL AUTO_INCREMENT,
    tenant_id       INT          NOT NULL,
    application_id  INT          NOT NULL,
    status          ENUM('unassigned', 'assigned', 'in_review', 'resolved') NOT NULL DEFAULT 'unassigned',
    priority        ENUM('low', 'normal', 'high', 'urgent') NOT NULL DEFAULT 'normal',
    reason          VARCHAR(500) NULL,
    flags           JSON         NULL,
    queued_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewer_id     INT          NULL,
    assigned_by     INT          NULL,
    assigned_at     DATETIME     NULL,
    assignment_note TEXT         NULL,
    resolution      ENUM('returned_for_reassessment') NULL,
    resolution_note TEXT         NULL,
    resolved_by     INT          NULL,
    resolved_at     DATETIME     NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at      DATETIME     NULL,
    open_case       TINYINT      GENERATED ALWAYS AS (IF(status <> 'resolved' AND deleted_at IS NULL, 1, NULL)) VIRTUAL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_manual_reviews_open_case (application_id, open_case),
    KEY idx_manual_reviews_tenant_status (tenant_id, status, priority),
    KEY idx_manual_reviews_tenant_reviewer (tenant_id, reviewer_id),
    CONSTRAINT fk_manual_reviews_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
    CONSTRAINT fk_manual_reviews_application FOREIGN KEY (application_id) REFERENCES applications (id),
    CONSTRAINT fk_manual_reviews_reviewer FOREIGN KEY (reviewer_id) REFERENCES users (id),
    CONSTRAINT fk_manual_reviews_assigned_by FOREIGN KEY (assigned_by) REFERENCES users (id),
    CONSTRAINT fk_manual_reviews_resolved_by FOREIGN KEY (resolved_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE application_document_requests (
    id                INT        NOT NULL AUTO_INCREMENT,
    application_id    INT        NOT NULL,
    review_id         INT        NULL,
    document_type_ids JSON       NOT NULL,
    message           TEXT       NULL,
    email_status      ENUM('sent', 'failed', 'not_configured') NOT NULL,
    requested_by      INT        NULL,
    created_at        DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at        DATETIME   NULL,

    PRIMARY KEY (id),
    KEY idx_application_document_requests_application (application_id),
    CONSTRAINT fk_application_document_requests_application FOREIGN KEY (application_id) REFERENCES applications (id),
    CONSTRAINT fk_application_document_requests_review FOREIGN KEY (review_id) REFERENCES manual_reviews (id),
    CONSTRAINT fk_application_document_requests_requested_by FOREIGN KEY (requested_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO modules (code, name, sort_order) VALUES ('reviews', 'Manual Review', 7);

INSERT INTO role_module_permissions (role_id, module_id, can_create, can_read, can_update, can_delete)
SELECT r.id, m.id, 0, 1, r.code <> 'read_only', 0 FROM roles r JOIN modules m ON m.code = 'reviews';

INSERT INTO manual_reviews (tenant_id, application_id, reason, queued_at)
SELECT a.tenant_id, a.id, 'Manual review needed', COALESCE(a.submitted_at, a.updated_at)
FROM applications a WHERE a.status = 'manual_review' AND a.deleted_at IS NULL;
