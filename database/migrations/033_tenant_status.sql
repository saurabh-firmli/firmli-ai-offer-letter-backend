-- 033: block a tenant (Platform admin).
--
-- tenants.status: active, or blocked by Firmli staff (e.g. unpaid). A blocked tenant's users cannot log in,
-- and their current tokens stop working at once; unblocking gives access back. Removing a tenant is a soft
-- delete of the tenant and its users. The platform tenant can be neither blocked nor removed.

ALTER TABLE tenants
    ADD COLUMN status ENUM('active', 'blocked') NOT NULL DEFAULT 'active' AFTER is_platform;
