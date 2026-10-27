import {before, describe, it} from "node:test";
import assert from "node:assert/strict";
import {startApp} from "./context.js";

// Firmli staff in the Platform admin panel: making a client tenant, its users, login details, block, remove
const {api, login, newTenant, mail} = await startApp();

describe("platform admin panel", () => {
    let staff;
    let other;
    let tenant;
    const body = {name: "Apex University", code: "apex", contactEmail: "office.apex@yopmail.com", admin: {name: "Neha Verma", email: "neha.apex@yopmail.com", password: "WelcomeNeha1"}};

    before(async () => {
        staff = await newTenant("Firmli", "staff.firmli@yopmail.com", {code: "FIRMLI", isPlatform: true});
        other = await newTenant("Other College", "admin.other@yopmail.com");
    });

    it("is for Firmli staff only", async () => {
        assert.equal((await other.api.get("/platform/tenants")).status, 403);
        assert.equal((await api.get("/platform/tenants")).status, 401);
    });

    it("is for Firmli's Super Admins only, not its other roles", async () => {
        const roles = (await staff.api.get("/dropdowns/roles")).body.data;
        await staff.api.post("/users", {name: "Read Only Staff", email: "readonly.firmli@yopmail.com", password: "Password123", roleId: roles.find((role) => role.code === "read_only").value});
        const readOnly = await login("readonly.firmli@yopmail.com", "Password123");

        assert.deepEqual((await readOnly.api.get("/platform/tenants")).body.errors, [{message: "Only a Firmli Super Admin can use the Platform panel or switch users"}]);
        assert.equal((await readOnly.api.post("/dev/switch-user", {userId: other.user.id})).status, 403);
        assert.equal((await readOnly.api.delete(`/platform/tenants/${other.tenant.id}`)).status, 403);
    });

    it("creates a tenant with its first Super Admin, who starts inactive", async () => {
        const res = await staff.api.post("/platform/tenants", body);
        tenant = res.body.data;

        assert.deepEqual([res.status, tenant.name, tenant.code, tenant.status, tenant.isPlatform, tenant.userCount], [201, "Apex University", "APEX", "active", false, 1]);
        assert.deepEqual(tenant.users.map((user) => [user.email, user.role, user.status]), [["neha.apex@yopmail.com", "super_admin", "inactive"]]);
    });

    it("refuses the same code or email, a bad code and a short password", async () => {
        const sameCode = await staff.api.post("/platform/tenants", {...body, admin: {...body.admin, email: "x.apex@yopmail.com"}});
        const sameEmail = await staff.api.post("/platform/tenants", {...body, code: "APEX2"});
        const badCode = await staff.api.post("/platform/tenants", {...body, code: "bad code!"});
        const shortPassword = await staff.api.post("/platform/tenants", {...body, code: "APEX3", admin: {...body.admin, email: "y.apex@yopmail.com", password: "short"}});

        assert.deepEqual(sameCode.body.errors, [{message: "Institution code already exists"}]);
        assert.deepEqual(sameEmail.body.errors, [{message: "Email is already registered"}]);
        assert.deepEqual(badCode.body.errors, {code: "Code must be 2 to 20 letters, digits or dashes"});
        assert.equal(shortPassword.status, 422);
    });

    it("emails the login details, only with the user's current password", async () => {
        const path = `/platform/tenants/${tenant.id}/users/${tenant.users[0].id}/send-credentials`;

        assert.deepEqual((await staff.api.post(path, {password: "notThePassword1"})).body.errors, {password: "This is not the user's current password"});
        const sent = await staff.api.post(path, {password: "WelcomeNeha1"});
        assert.deepEqual([sent.status, sent.body.data], [200, {sentTo: "neha.apex@yopmail.com"}]);

        const email = await mail.waitFor((message) => message.to.includes("neha.apex@yopmail.com"));
        assert.match(email.text, /WelcomeNeha1/);
        assert.match(email.headers.from, /Apex University/);
        assert.equal((await other.api.post(path, {password: "WelcomeNeha1"})).status, 403);
    });

    it("makes the admin active at the first login, with the tenant's settings ready", async () => {
        const admin = await login("neha.apex@yopmail.com", "WelcomeNeha1");

        assert.equal(admin.user.status, "active");
        assert.equal((await admin.api.get("/settings")).body.data.name, "Apex University");
    });

    it("lists tenants with counts, search and status filter", async () => {
        const list = (await staff.api.get("/platform/tenants?limit=100")).body.data;
        const row = list.items.find((item) => item.id === tenant.id);

        assert.equal(list.items[0].isPlatform, true);
        assert.deepEqual([row.userCount, row.activeUserCount, row.applicationCount], [1, 1, 0]);
        assert.deepEqual((await staff.api.get("/platform/tenants?search=APEX")).body.data.items.map((item) => item.id), [tenant.id]);
    });

    it("blocks a tenant: its tokens stop and login is refused, until it is unblocked", async () => {
        const admin = await login("neha.apex@yopmail.com", "WelcomeNeha1");
        assert.equal((await staff.api.patch(`/platform/tenants/${tenant.id}`, {status: "blocked"})).body.data.status, "blocked");

        const me = await admin.api.get("/auth/me");
        const again = await api.post("/auth/login", {email: "neha.apex@yopmail.com", password: "WelcomeNeha1"});
        const wrongPassword = await api.post("/auth/login", {email: "neha.apex@yopmail.com", password: "wrongPassword1"});
        assert.deepEqual([me.status, me.body.code], [401, "TENANT_BLOCKED"]);
        assert.deepEqual([again.status, again.body.code], [403, "TENANT_BLOCKED"]);
        assert.equal(wrongPassword.status, 401);
        assert.deepEqual((await staff.api.get("/platform/tenants?status=blocked")).body.data.items.map((item) => item.id), [tenant.id]);

        await staff.api.patch(`/platform/tenants/${tenant.id}`, {status: "active"});
        assert.equal((await api.post("/auth/login", {email: "neha.apex@yopmail.com", password: "WelcomeNeha1"})).status, 200);
    });

    it("never blocks or removes the platform tenant", async () => {
        assert.deepEqual((await staff.api.patch(`/platform/tenants/${staff.tenant.id}`, {status: "blocked"})).body.errors, [{message: "The platform tenant cannot be blocked or removed"}]);
        assert.equal((await staff.api.delete(`/platform/tenants/${staff.tenant.id}`)).status, 409);
    });

    it("shows the client what Firmli staff changed, in its own audit log", async () => {
        await staff.api.patch(`/platform/tenants/${tenant.id}`, {name: "Apex University Ltd"});
        const admin = await login("neha.apex@yopmail.com", "WelcomeNeha1");
        const entries = (await admin.api.get("/audit-logs?entityType=tenant&limit=20")).body.data.items;

        assert.equal(entries[0].changes.name.to, "Apex University Ltd");
        assert.equal(entries[0].userName, "Firmli Admin");
        assert.ok(entries.some((entry) => entry.changes.status?.to === "blocked"));
    });

    it("removes a tenant: its users cannot log in, and its code and email are free again", async () => {
        const admin = await login("neha.apex@yopmail.com", "WelcomeNeha1");
        assert.equal((await staff.api.delete(`/platform/tenants/${tenant.id}`)).status, 200);

        assert.equal((await staff.api.get(`/platform/tenants/${tenant.id}`)).status, 404);
        assert.equal((await admin.api.get("/auth/me")).status, 401);
        assert.equal((await api.post("/auth/login", {email: "neha.apex@yopmail.com", password: "WelcomeNeha1"})).status, 401);
        assert.equal((await staff.api.post("/platform/tenants", body)).status, 201);
    });
});
