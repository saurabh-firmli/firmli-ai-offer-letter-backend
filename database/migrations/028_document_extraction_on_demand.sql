-- 028: read one document with the AI on demand ("Extract" on the Documents tab), outside an assessment run.
--
-- Such a reading has no assessment_id; requested_by is who asked for it. A run still reads every document
-- itself, so an on-demand reading never changes an assessment.

ALTER TABLE application_document_extractions
    MODIFY COLUMN assessment_id INT NULL,
    ADD COLUMN requested_by INT NULL AFTER error_message,
    ADD KEY idx_application_document_extractions_document (document_id),
    ADD CONSTRAINT fk_application_document_extractions_requested_by FOREIGN KEY (requested_by) REFERENCES users (id);
