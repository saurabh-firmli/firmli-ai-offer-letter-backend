-- 029: decisions by people.
--
-- applications.decision_*: who decided the outcome. decision_source "ai" when the AI assessment decided,
-- "manual" when a person did (a Manual Review decision, or Change outcome), with decided_by, decided_at and
-- the reason. Cleared when the application goes back to the AI.
--
-- manual_reviews.resolution: a case can now also be resolved by a decision, "approved" (conditional offer)
-- or "rejected", with the reason in resolution_note.
--
-- application_assessment_criteria.override_*: a reviewer's own result for a criterion (met / not_met) with
-- a note. The AI's result stays in `result` next to it.

ALTER TABLE applications
    ADD COLUMN decision_source ENUM('ai', 'manual') NULL AFTER confidence,
    ADD COLUMN decided_by INT NULL AFTER decision_source,
    ADD COLUMN decided_at DATETIME NULL AFTER decided_by,
    ADD COLUMN decision_reason TEXT NULL AFTER decided_at,
    ADD CONSTRAINT fk_applications_decided_by FOREIGN KEY (decided_by) REFERENCES users (id);

UPDATE applications SET decision_source = 'ai' WHERE outcome IS NOT NULL;

ALTER TABLE manual_reviews
    MODIFY COLUMN resolution ENUM('returned_for_reassessment', 'approved', 'rejected') NULL;

ALTER TABLE application_assessment_criteria
    ADD COLUMN override_result ENUM('met', 'not_met') NULL AFTER reasoning,
    ADD COLUMN override_note TEXT NULL AFTER override_result,
    ADD COLUMN overridden_by INT NULL AFTER override_note,
    ADD COLUMN overridden_at DATETIME NULL AFTER overridden_by,
    ADD CONSTRAINT fk_application_assessment_criteria_overridden_by FOREIGN KEY (overridden_by) REFERENCES users (id);
