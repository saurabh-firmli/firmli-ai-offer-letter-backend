-- 025: institution website (Settings > Institution Details), and the {{institution_website}} variable
-- for letter and email templates.

ALTER TABLE tenants
    ADD COLUMN website VARCHAR(255) NULL AFTER address;

INSERT INTO letter_variables (name, label, sort_order) VALUES
    ('institution_website', 'Institution Website', 125);
