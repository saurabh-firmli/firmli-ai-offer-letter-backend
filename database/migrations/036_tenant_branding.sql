-- 036: branding for letters.
--
-- tenants.logo_storage_key: the institution's logo (PNG or JPG) in S3, uploaded in Settings; it heads
-- every letter PDF. tenants.brand_color: "#1E3A8A"-style colour for the letterhead line, table headers
-- and headings of the PDF (NULL = Firmli's default navy).

ALTER TABLE tenants
    ADD COLUMN logo_storage_key VARCHAR(500) NULL AFTER website,
    ADD COLUMN brand_color CHAR(7) NULL AFTER logo_storage_key;
