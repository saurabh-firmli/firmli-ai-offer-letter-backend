-- 037: the database itself keeps each tenant's data apart and refuses duplicates the code already avoids.
--
-- 1. Tenant-safe foreign keys: a row can only point to a record of its own tenant. Each parent gets
--    UNIQUE (tenant_id, id), and each reference becomes FOREIGN KEY (tenant_id, x_id) REFERENCES parent (tenant_id, id)
--    (same constraint names; a NULL reference is not checked, as before).
-- 2. application_letters: one letter per version number of an application.
-- 3. application_assessment_criteria: one result per criterion in a run.
-- 4. eligibility_set_versions: at most one published and one draft version per set.
--
-- Error 1452 on an ADD CONSTRAINT means a row points to another tenant's record or holds a duplicate: fix that
-- row and run the remaining statements. Checked on the local database: no such rows.

ALTER TABLE users ADD UNIQUE KEY uq_users_tenant_id (tenant_id, id);
ALTER TABLE students ADD UNIQUE KEY uq_students_tenant_id (tenant_id, id);
ALTER TABLE campuses ADD UNIQUE KEY uq_campuses_tenant_id (tenant_id, id);
ALTER TABLE eligibility_sets ADD UNIQUE KEY uq_eligibility_sets_tenant_id (tenant_id, id);
ALTER TABLE letter_templates ADD UNIQUE KEY uq_letter_templates_tenant_id (tenant_id, id);
ALTER TABLE email_templates ADD UNIQUE KEY uq_email_templates_tenant_id (tenant_id, id);
ALTER TABLE programs ADD UNIQUE KEY uq_programs_tenant_id (tenant_id, id);
ALTER TABLE applications ADD UNIQUE KEY uq_applications_tenant_id (tenant_id, id);
ALTER TABLE manual_reviews ADD UNIQUE KEY uq_manual_reviews_tenant_id (tenant_id, id);
ALTER TABLE application_assessments ADD UNIQUE KEY uq_application_assessments_tenant_id (tenant_id, id);
ALTER TABLE application_letters ADD UNIQUE KEY uq_application_letters_tenant_id (tenant_id, id);

ALTER TABLE applications
    DROP FOREIGN KEY fk_applications_program,
    DROP INDEX fk_applications_program,
    DROP FOREIGN KEY fk_applications_student,
    DROP INDEX fk_applications_student,
    DROP FOREIGN KEY fk_applications_assigned_officer,
    DROP INDEX fk_applications_assigned_officer,
    DROP FOREIGN KEY fk_applications_submitted_by,
    DROP INDEX fk_applications_submitted_by,
    DROP FOREIGN KEY fk_applications_decided_by,
    DROP INDEX fk_applications_decided_by;
ALTER TABLE applications
    ADD CONSTRAINT fk_applications_program FOREIGN KEY (tenant_id, program_id) REFERENCES programs (tenant_id, id),
    ADD CONSTRAINT fk_applications_student FOREIGN KEY (tenant_id, student_id) REFERENCES students (tenant_id, id),
    ADD CONSTRAINT fk_applications_assigned_officer FOREIGN KEY (tenant_id, assigned_officer_id) REFERENCES users (tenant_id, id),
    ADD CONSTRAINT fk_applications_submitted_by FOREIGN KEY (tenant_id, submitted_by) REFERENCES users (tenant_id, id),
    ADD CONSTRAINT fk_applications_decided_by FOREIGN KEY (tenant_id, decided_by) REFERENCES users (tenant_id, id);

ALTER TABLE programs
    DROP FOREIGN KEY fk_programs_campus,
    DROP INDEX fk_programs_campus,
    DROP FOREIGN KEY fk_programs_eligibility_set,
    DROP INDEX fk_programs_eligibility_set,
    DROP FOREIGN KEY fk_programs_conditional_offer_template,
    DROP INDEX fk_programs_conditional_offer_template,
    DROP FOREIGN KEY fk_programs_rejection_template,
    DROP INDEX fk_programs_rejection_template,
    DROP FOREIGN KEY fk_programs_manual_review_template,
    DROP INDEX fk_programs_manual_review_template,
    DROP FOREIGN KEY fk_programs_offer_email_template,
    DROP INDEX fk_programs_offer_email_template,
    DROP FOREIGN KEY fk_programs_rejection_email_template,
    DROP INDEX fk_programs_rejection_email_template;
ALTER TABLE programs
    ADD CONSTRAINT fk_programs_campus FOREIGN KEY (tenant_id, campus_id) REFERENCES campuses (tenant_id, id),
    ADD CONSTRAINT fk_programs_eligibility_set FOREIGN KEY (tenant_id, eligibility_set_id) REFERENCES eligibility_sets (tenant_id, id),
    ADD CONSTRAINT fk_programs_conditional_offer_template FOREIGN KEY (tenant_id, conditional_offer_template_id) REFERENCES letter_templates (tenant_id, id),
    ADD CONSTRAINT fk_programs_rejection_template FOREIGN KEY (tenant_id, rejection_template_id) REFERENCES letter_templates (tenant_id, id),
    ADD CONSTRAINT fk_programs_manual_review_template FOREIGN KEY (tenant_id, manual_review_template_id) REFERENCES letter_templates (tenant_id, id),
    ADD CONSTRAINT fk_programs_offer_email_template FOREIGN KEY (tenant_id, offer_email_template_id) REFERENCES email_templates (tenant_id, id),
    ADD CONSTRAINT fk_programs_rejection_email_template FOREIGN KEY (tenant_id, rejection_email_template_id) REFERENCES email_templates (tenant_id, id);

ALTER TABLE tenant_settings
    DROP FOREIGN KEY fk_tenant_settings_reviewer,
    DROP INDEX fk_tenant_settings_reviewer;
ALTER TABLE tenant_settings
    ADD CONSTRAINT fk_tenant_settings_reviewer FOREIGN KEY (tenant_id, default_reviewer_id) REFERENCES users (tenant_id, id);

ALTER TABLE manual_reviews
    DROP FOREIGN KEY fk_manual_reviews_application,
    DROP FOREIGN KEY fk_manual_reviews_reviewer,
    DROP INDEX fk_manual_reviews_reviewer,
    DROP FOREIGN KEY fk_manual_reviews_assigned_by,
    DROP INDEX fk_manual_reviews_assigned_by,
    DROP FOREIGN KEY fk_manual_reviews_resolved_by,
    DROP INDEX fk_manual_reviews_resolved_by;
ALTER TABLE manual_reviews
    ADD CONSTRAINT fk_manual_reviews_application FOREIGN KEY (tenant_id, application_id) REFERENCES applications (tenant_id, id),
    ADD CONSTRAINT fk_manual_reviews_reviewer FOREIGN KEY (tenant_id, reviewer_id) REFERENCES users (tenant_id, id),
    ADD CONSTRAINT fk_manual_reviews_assigned_by FOREIGN KEY (tenant_id, assigned_by) REFERENCES users (tenant_id, id),
    ADD CONSTRAINT fk_manual_reviews_resolved_by FOREIGN KEY (tenant_id, resolved_by) REFERENCES users (tenant_id, id);

ALTER TABLE application_assessments
    DROP FOREIGN KEY fk_application_assessments_application,
    DROP INDEX fk_application_assessments_application,
    DROP FOREIGN KEY fk_application_assessments_triggered_by,
    DROP INDEX fk_application_assessments_triggered_by;
ALTER TABLE application_assessments
    ADD CONSTRAINT fk_application_assessments_application FOREIGN KEY (tenant_id, application_id) REFERENCES applications (tenant_id, id),
    ADD CONSTRAINT fk_application_assessments_triggered_by FOREIGN KEY (tenant_id, triggered_by) REFERENCES users (tenant_id, id);

ALTER TABLE application_letters
    DROP FOREIGN KEY fk_application_letters_application,
    DROP FOREIGN KEY fk_application_letters_assessment,
    DROP INDEX fk_application_letters_assessment,
    DROP FOREIGN KEY fk_application_letters_template,
    DROP INDEX fk_application_letters_template,
    DROP FOREIGN KEY fk_application_letters_generated_by,
    DROP INDEX fk_application_letters_generated_by,
    DROP FOREIGN KEY fk_application_letters_reviewed_by,
    DROP INDEX fk_application_letters_reviewed_by;
ALTER TABLE application_letters
    ADD CONSTRAINT fk_application_letters_application FOREIGN KEY (tenant_id, application_id) REFERENCES applications (tenant_id, id),
    ADD CONSTRAINT fk_application_letters_assessment FOREIGN KEY (tenant_id, assessment_id) REFERENCES application_assessments (tenant_id, id),
    ADD CONSTRAINT fk_application_letters_template FOREIGN KEY (tenant_id, template_id) REFERENCES letter_templates (tenant_id, id),
    ADD CONSTRAINT fk_application_letters_generated_by FOREIGN KEY (tenant_id, generated_by) REFERENCES users (tenant_id, id),
    ADD CONSTRAINT fk_application_letters_reviewed_by FOREIGN KEY (tenant_id, reviewed_by) REFERENCES users (tenant_id, id);

ALTER TABLE application_emails
    DROP FOREIGN KEY fk_application_emails_application,
    DROP FOREIGN KEY fk_application_emails_letter,
    DROP FOREIGN KEY fk_application_emails_template,
    DROP INDEX fk_application_emails_template,
    DROP FOREIGN KEY fk_application_emails_sent_by,
    DROP INDEX fk_application_emails_sent_by;
ALTER TABLE application_emails
    ADD CONSTRAINT fk_application_emails_application FOREIGN KEY (tenant_id, application_id) REFERENCES applications (tenant_id, id),
    ADD CONSTRAINT fk_application_emails_letter FOREIGN KEY (tenant_id, letter_id) REFERENCES application_letters (tenant_id, id),
    ADD CONSTRAINT fk_application_emails_template FOREIGN KEY (tenant_id, template_id) REFERENCES email_templates (tenant_id, id),
    ADD CONSTRAINT fk_application_emails_sent_by FOREIGN KEY (tenant_id, sent_by) REFERENCES users (tenant_id, id);

ALTER TABLE application_notes
    DROP FOREIGN KEY fk_application_notes_application,
    DROP FOREIGN KEY fk_application_notes_review,
    DROP INDEX fk_application_notes_review,
    DROP FOREIGN KEY fk_application_notes_created_by,
    DROP INDEX fk_application_notes_created_by;
ALTER TABLE application_notes
    ADD CONSTRAINT fk_application_notes_application FOREIGN KEY (tenant_id, application_id) REFERENCES applications (tenant_id, id),
    ADD CONSTRAINT fk_application_notes_review FOREIGN KEY (tenant_id, review_id) REFERENCES manual_reviews (tenant_id, id),
    ADD CONSTRAINT fk_application_notes_created_by FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id);

ALTER TABLE ai_usage_logs
    DROP FOREIGN KEY fk_ai_usage_logs_application,
    DROP INDEX fk_ai_usage_logs_application,
    DROP FOREIGN KEY fk_ai_usage_logs_assessment,
    DROP FOREIGN KEY fk_ai_usage_logs_triggered_by,
    DROP INDEX fk_ai_usage_logs_triggered_by;
ALTER TABLE ai_usage_logs
    ADD CONSTRAINT fk_ai_usage_logs_application FOREIGN KEY (tenant_id, application_id) REFERENCES applications (tenant_id, id),
    ADD CONSTRAINT fk_ai_usage_logs_assessment FOREIGN KEY (tenant_id, assessment_id) REFERENCES application_assessments (tenant_id, id),
    ADD CONSTRAINT fk_ai_usage_logs_triggered_by FOREIGN KEY (tenant_id, triggered_by) REFERENCES users (tenant_id, id);

ALTER TABLE password_resets
    DROP FOREIGN KEY fk_password_resets_user;
ALTER TABLE password_resets
    ADD CONSTRAINT fk_password_resets_user FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id);

ALTER TABLE application_letters ADD UNIQUE KEY uq_application_letters_version (application_id, version, not_deleted);

ALTER TABLE application_assessment_criteria
    ADD COLUMN not_deleted TINYINT GENERATED ALWAYS AS (IF(deleted_at IS NULL, 1, NULL)) VIRTUAL,
    ADD UNIQUE KEY uq_application_assessment_criteria_criterion (assessment_id, criterion_id, not_deleted);

ALTER TABLE eligibility_set_versions
    ADD COLUMN live_published TINYINT GENERATED ALWAYS AS (IF(status = 'published' AND deleted_at IS NULL, 1, NULL)) VIRTUAL,
    ADD COLUMN live_draft TINYINT GENERATED ALWAYS AS (IF(status = 'draft' AND deleted_at IS NULL, 1, NULL)) VIRTUAL,
    ADD UNIQUE KEY uq_eligibility_set_versions_published (eligibility_set_id, live_published),
    ADD UNIQUE KEY uq_eligibility_set_versions_draft (eligibility_set_id, live_draft);
