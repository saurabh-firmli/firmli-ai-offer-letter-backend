-- 009: soft delete everywhere. A row is never removed: deleting it sets deleted_at (Sequelize
-- "paranoid" models), and every query skips rows whose deleted_at is set.
--
-- Unique keys must ignore deleted rows, so the name of a deleted campus or the code of a deleted
-- program can be used again. MySQL treats NULLs as different in a unique key, so each table with a
-- unique key gets a generated column not_deleted (1 for a live row, NULL for a deleted one) as the
-- last column of its unique keys: live rows stay unique, deleted rows never clash.
--
-- Foreign keys stay, but a soft delete does not trigger them, so "still in use" is checked in code.
-- eligibility_criterion_documents gets its own id: its old (criterion, document type) primary key
-- would clash when a removed document type is ticked again.

ALTER TABLE tenants
    ADD COLUMN deleted_at DATETIME NULL;

ALTER TABLE users
    ADD COLUMN deleted_at DATETIME NULL,
    ADD COLUMN not_deleted TINYINT GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,
    DROP INDEX uq_users_email,
    ADD UNIQUE KEY uq_users_email (email, not_deleted);

ALTER TABLE countries
    ADD COLUMN deleted_at DATETIME NULL,
    ADD COLUMN not_deleted TINYINT GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,
    DROP INDEX uq_countries_iso2,
    ADD UNIQUE KEY uq_countries_iso2 (iso2, not_deleted);

ALTER TABLE states
    ADD COLUMN deleted_at DATETIME NULL,
    ADD COLUMN not_deleted TINYINT GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,
    DROP INDEX uq_states_country_code,
    ADD UNIQUE KEY uq_states_country_code (country_id, code, not_deleted);

ALTER TABLE cities
    ADD COLUMN deleted_at DATETIME NULL,
    ADD COLUMN not_deleted TINYINT GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,
    DROP INDEX uq_cities_state_name,
    ADD UNIQUE KEY uq_cities_state_name (state_id, name, not_deleted);

ALTER TABLE campuses
    ADD COLUMN deleted_at DATETIME NULL,
    ADD COLUMN not_deleted TINYINT GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,
    DROP INDEX uq_campuses_tenant_name_city,
    ADD UNIQUE KEY uq_campuses_tenant_name_city (tenant_id, name, city_id, not_deleted);

ALTER TABLE letter_variables
    ADD COLUMN deleted_at DATETIME NULL,
    ADD COLUMN not_deleted TINYINT GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,
    DROP INDEX uq_letter_variables_name,
    ADD UNIQUE KEY uq_letter_variables_name (name, not_deleted);

ALTER TABLE document_types
    ADD COLUMN deleted_at DATETIME NULL,
    ADD COLUMN not_deleted TINYINT GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,
    DROP INDEX uq_document_types_code,
    ADD UNIQUE KEY uq_document_types_code (code, not_deleted);

ALTER TABLE eligibility_categories
    ADD COLUMN deleted_at DATETIME NULL,
    ADD COLUMN not_deleted TINYINT GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,
    DROP INDEX uq_eligibility_categories_code,
    ADD UNIQUE KEY uq_eligibility_categories_code (code, not_deleted);

ALTER TABLE eligibility_sets
    ADD COLUMN deleted_at DATETIME NULL,
    ADD COLUMN not_deleted TINYINT GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,
    DROP INDEX uq_eligibility_sets_tenant_name,
    ADD UNIQUE KEY uq_eligibility_sets_tenant_name (tenant_id, name, not_deleted);

ALTER TABLE eligibility_set_versions
    ADD COLUMN deleted_at DATETIME NULL,
    ADD COLUMN not_deleted TINYINT GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,
    DROP INDEX uq_eligibility_set_versions_number,
    ADD UNIQUE KEY uq_eligibility_set_versions_number (eligibility_set_id, version_number, not_deleted);

ALTER TABLE eligibility_criteria
    ADD COLUMN deleted_at DATETIME NULL;

ALTER TABLE eligibility_criterion_documents
    DROP PRIMARY KEY,
    ADD COLUMN id INT NOT NULL AUTO_INCREMENT FIRST,
    ADD PRIMARY KEY (id),
    ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    ADD COLUMN deleted_at DATETIME NULL,
    ADD COLUMN not_deleted TINYINT GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,
    ADD UNIQUE KEY uq_eligibility_criterion_documents (criterion_id, document_type_id, not_deleted);

ALTER TABLE eligibility_document_requirements
    ADD COLUMN deleted_at DATETIME NULL,
    ADD COLUMN not_deleted TINYINT GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,
    DROP INDEX uq_eligibility_document_requirements_type,
    ADD UNIQUE KEY uq_eligibility_document_requirements_type (version_id, document_type_id, not_deleted);

ALTER TABLE letter_templates
    ADD COLUMN deleted_at DATETIME NULL,
    ADD COLUMN not_deleted TINYINT GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,
    DROP INDEX uq_letter_templates_tenant_name,
    ADD UNIQUE KEY uq_letter_templates_tenant_name (tenant_id, name, not_deleted);

ALTER TABLE programs
    ADD COLUMN deleted_at DATETIME NULL,
    ADD COLUMN not_deleted TINYINT GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,
    DROP INDEX uq_programs_tenant_code,
    ADD UNIQUE KEY uq_programs_tenant_code (tenant_id, code, not_deleted);
