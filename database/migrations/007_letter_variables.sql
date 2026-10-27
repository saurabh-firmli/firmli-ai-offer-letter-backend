-- 007: the {{variables}} a letter template may use, moved from code to a table shared by all tenants.
-- name is what a template writes inside the braces ({{student_full_name}}), label is what the
-- "Insert variable" dropdown shows, sort_order is the dropdown order.
-- To add a variable later: a new migration with one INSERT (and the same row in schema.sql).

CREATE TABLE letter_variables (
    id          INT          NOT NULL AUTO_INCREMENT,
    name        VARCHAR(50)  NOT NULL,
    label       VARCHAR(100) NOT NULL,
    sort_order  INT          NOT NULL DEFAULT 0,

    PRIMARY KEY (id),
    UNIQUE KEY uq_letter_variables_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO letter_variables (name, label, sort_order) VALUES
    ('student_full_name',   'Student Full Name',    10),
    ('application_number',  'Application Number',   20),
    ('student_email',       'Student Email',        30),
    ('program_name',        'Program Name',         40),
    ('program_code',        'Program Code',         50),
    ('campus',              'Campus',               60),
    ('intake',              'Intake',               70),
    ('application_date',    'Application Date',     80),
    ('decision_date',       'Decision Date',        90),
    ('offer_expiry_date',   'Offer Expiry Date',    100),
    ('institution_name',    'Institution Name',     110),
    ('institution_address', 'Institution Address',  120),
    ('eligibility_table',   'Eligibility Table',    130),
    ('conditions',          'Conditions',           140),
    ('unmet_requirements',  'Unmet Requirements',   150),
    ('missing_documents',   'Missing Documents',    160),
    ('signatory_name',      'Authorized Signatory', 170),
    ('signatory_title',     'Signatory Title',      180);
