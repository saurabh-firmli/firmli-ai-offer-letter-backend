-- 035: indexes for the busiest reads.
--
-- applications (tenant_id, submitted_at): the dashboard, reports, CSV export and "recent" lists filter
-- and sort by submission time (the date filters now compare the bare column, so the index applies).
-- applications (tenant_id, assessment_status): the notification bell and the assessment status filter.

ALTER TABLE applications
    ADD KEY idx_applications_tenant_submitted (tenant_id, submitted_at),
    ADD KEY idx_applications_tenant_assessment (tenant_id, assessment_status);
