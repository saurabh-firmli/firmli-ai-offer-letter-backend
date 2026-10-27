-- 001: programs table (src/v1/models/client/program.model.js)

CREATE TABLE programs (
    id                              INT          NOT NULL AUTO_INCREMENT,
    name                            VARCHAR(150) NOT NULL,
    code                            VARCHAR(50)  NOT NULL,
    award_level                     VARCHAR(100) NULL,
    campus                          VARCHAR(150) NULL,
    duration                        VARCHAR(50)  NULL,
    study_mode                      ENUM('full_time', 'part_time', 'online', 'hybrid') NOT NULL DEFAULT 'full_time',
    application_deadline            DATE         NULL,
    status                          ENUM('draft', 'active', 'inactive', 'archived')    NOT NULL DEFAULT 'draft',
    description                     TEXT         NULL,

    -- Letter templates (NULL = none)
    conditional_offer_template_id   INT          NULL,
    rejection_template_id           INT          NULL,
    manual_review_template_id       INT          NULL,

    -- Email templates (NULL = none)
    offer_email_template_id         INT          NULL,
    rejection_email_template_id     INT          NULL,

    created_at                      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_programs_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
