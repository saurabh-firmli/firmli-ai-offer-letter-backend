-- 032: the platform tenant (Firmli's own).
--
-- tenants.is_platform: users of this tenant are Firmli staff. Only they may use "Switch tenant / user"
-- (/v1/dev/switch-user) to see the app as any client's user. No tenant is marked here (ids differ between
-- databases): mark Firmli's tenant once with `npm run platform-tenant -- <tenant id or code>`.

ALTER TABLE tenants
    ADD COLUMN is_platform TINYINT(1) NOT NULL DEFAULT 0 AFTER website;
