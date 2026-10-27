import {before, describe, it} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {startApp} from "./context.js";

// Logging in, passwords, users and their status, roles and module permissions, inside one tenant
const {api, login, newTenant, mail, db, models} = await startApp();

const ALL = {create: true, read: true, update: true, delete: true};
const NONE = {create: false, read: false, update: false, delete: false};
const READ = {create: false, read: true, update: false, delete: false};
const resetTokenIn = (email) => email.text.match(/reset-password\?token=([A-Za-z0-9_-]+)/)?.[1];
const status = async (client, path) => (await client.get(path)).status;

let admin;
let roleId;
const addUser = async (by, name, roleCode, extra = {}) => {
    const email = `${name.toLowerCase()}.pune@yopmail.com`;
    const res = await by.api.post("/users", {name, email, password: "Password123", roleId: roleId(roleCode), ...extra});
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return {...res.body.data, email};
};

before(async () => {
    admin = await newTenant("Pune Institute", "admin.pune@yopmail.com", {password: "Admin12345"});
    const roles = (await admin.api.get("/roles")).body.data.roles;
    roleId = (code) => roles.find((role) => role.code === code).id;
});

describe("login and the session", () => {
    it("answers the user with role, permissions and tenant", async () => {
        const me = (await admin.api.get("/auth/me")).body.data;

        assert.deepEqual([me.email, me.role, me.status, me.tenant.name], ["admin.pune@yopmail.com", "super_admin", "active", "Pune Institute"]);
        assert.deepEqual(me.permissions.users, ALL);
        assert.deepEqual(me.permissions.audit_logs, READ);
        assert.equal("passwordHash" in me, false);
    });

    it("says only 'invalid' for a wrong password or an unknown email, and takes the email in any case", async () => {
        const wrong = await api.post("/auth/login", {email: "admin.pune@yopmail.com", password: "wrongPassword1"});
        const unknown = await api.post("/auth/login", {email: "nobody.pune@yopmail.com", password: "Admin12345"});

        assert.deepEqual([wrong.status, wrong.body.errors], [401, [{message: "Invalid email or password"}]]);
        assert.deepEqual(unknown.body.errors, wrong.body.errors);
        assert.equal((await api.post("/auth/login", {email: "ADMIN.Pune@YopMail.com", password: "Admin12345"})).status, 200);
    });

    it("changes the password: every older token ends, an email tells the user", async () => {
        const otherDevice = await login("admin.pune@yopmail.com", "Admin12345");
        assert.deepEqual((await admin.api.post("/auth/change-password", {currentPassword: "nope-nope-1", newPassword: "Admin67890"})).body.errors, {currentPassword: "The current password is incorrect"});
        assert.deepEqual((await admin.api.post("/auth/change-password", {currentPassword: "Admin12345", newPassword: "Admin12345"})).body.errors, {newPassword: "The new password must be different from the current one"});

        const changed = await admin.api.post("/auth/change-password", {currentPassword: "Admin12345", newPassword: "Admin67890"});
        assert.equal(changed.status, 200);
        assert.deepEqual([await status(admin.api, "/auth/me"), await status(otherDevice.api, "/auth/me")], [401, 401]);
        assert.equal((await api.post("/auth/login", {email: "admin.pune@yopmail.com", password: "Admin12345"})).status, 401);
        await mail.waitFor((email) => email.subject === "Your Pune Institute password was changed");

        admin = await login("admin.pune@yopmail.com", "Admin67890");
    });

    it("logs out of every device", async () => {
        const otherDevice = await login("admin.pune@yopmail.com", "Admin67890");
        assert.equal((await otherDevice.api.post("/auth/logout-all")).status, 200);

        assert.deepEqual([await status(admin.api, "/auth/me"), await status(otherDevice.api, "/auth/me")], [401, 401]);
        admin = await login("admin.pune@yopmail.com", "Admin67890");
    });
});

describe("forgot password", () => {
    const generic = "If an account exists for this email, a reset link is on its way";

    it("answers the same for an unknown email, and sends nothing", async () => {
        const res = await api.post("/auth/forgot-password", {email: "nobody.pune@yopmail.com"});

        assert.deepEqual([res.status, res.body.message], [200, generic]);
        assert.equal(mail.to("nobody.pune@yopmail.com").length, 0);
    });

    it("emails a one-time link; only its hash is stored; a newer link ends the older one", async () => {
        await api.post("/auth/forgot-password", {email: "Admin.Pune@yopmail.com"});
        const first = resetTokenIn(await mail.waitFor((email) => email.subject === "Reset your Pune Institute password"));
        assert.ok(first);
        assert.equal((await db.select("SELECT id FROM password_resets WHERE token_hash = :first", {first})).length, 0);
        assert.deepEqual((await api.post("/auth/reset-password/verify", {token: first})).body.data, {email: "admin.pune@yopmail.com"});

        await api.post("/auth/forgot-password", {email: "admin.pune@yopmail.com"});
        await mail.waitFor((email) => email.subject.startsWith("Reset") && resetTokenIn(email) !== first);
        const second = resetTokenIn(mail.messages.filter((email) => email.subject.startsWith("Reset")).at(-1));
        assert.equal((await api.post("/auth/reset-password/verify", {token: first})).status, 400);

        const before = await login("admin.pune@yopmail.com", "Admin67890");
        const reset = await api.post("/auth/reset-password", {token: second, password: "Admin24680"});
        assert.deepEqual([reset.status, reset.body.data.user.email], [200, "admin.pune@yopmail.com"]);
        assert.equal(await status(before.api, "/auth/me"), 401);
        assert.equal((await api.post("/auth/reset-password", {token: second, password: "Admin13579"})).status, 400);
        admin = await login("admin.pune@yopmail.com", "Admin24680");
    });

    it("refuses an expired link", async () => {
        await models.sequelize.query(
            "INSERT INTO password_resets (tenant_id, user_id, token_hash, expires_at) VALUES (:tenantId, :userId, :hash, NOW() - INTERVAL 1 MINUTE)",
            {replacements: {tenantId: admin.user.tenantId, userId: admin.user.id, hash: createHash("sha256").update("expired-token").digest("hex")}}
        );

        assert.equal((await api.post("/auth/reset-password", {token: "expired-token", password: "Admin11111"})).status, 400);
    });
});

describe("users and their status", () => {
    let riya;

    it("adds a user who starts inactive and becomes active at the first login", async () => {
        riya = await addUser(admin, "Riya", "admissions_officer");
        assert.deepEqual([riya.status, riya.lastLoginAt], ["inactive", null]);

        const first = await login(riya.email, "Password123");
        assert.equal(first.user.status, "active");
        const activation = (await admin.api.get(`/audit-logs?entityType=user&entityId=${riya.id}&action=update`)).body.data.items;
        assert.deepEqual([activation[0].userId, activation[0].changes], [riya.id, {status: {from: "inactive", to: "active"}}]);
    });

    it("refuses the same email twice, and an unknown role", async () => {
        assert.deepEqual((await admin.api.post("/users", {name: "Riya 2", email: riya.email, password: "Password123", roleId: roleId("reviewer")})).body.errors, [{message: "Email is already registered"}]);
        assert.deepEqual((await admin.api.post("/users", {name: "X", email: "x.pune@yopmail.com", password: "Password123", roleId: 9999})).body.errors, {roleId: "Role not found"});
    });

    it("blocks a user: the session ends at once and login is refused", async () => {
        const session = await login(riya.email, "Password123");
        assert.equal((await admin.api.patch(`/users/${riya.id}`, {status: "blocked"})).body.data.status, "blocked");

        const me = await session.api.get("/auth/me");
        const again = await api.post("/auth/login", {email: riya.email, password: "Password123"});
        assert.deepEqual([me.status, me.body.errors], [401, [{message: "Your account is blocked; contact your administrator"}]]);
        assert.deepEqual([again.status, again.body.code], [403, "ACCOUNT_NOT_ACTIVE"]);
        assert.deepEqual((await admin.api.get("/users?status=blocked")).body.data.map((user) => user.id), [riya.id]);

        await admin.api.patch(`/users/${riya.id}`, {status: "active"});
        assert.equal((await api.post("/auth/login", {email: riya.email, password: "Password123"})).status, 200);
    });

    it("never lets a user change their own status or role", async () => {
        assert.deepEqual((await admin.api.patch(`/users/${admin.user.id}`, {status: "inactive"})).body.errors, [{message: "You cannot change your own status"}]);
        assert.equal((await admin.api.patch(`/users/${admin.user.id}`, {roleId: roleId("read_only")})).status, 403);
    });

    it("logs a user out when an admin sets their password", async () => {
        const session = await login(riya.email, "Password123");
        await admin.api.patch(`/users/${riya.id}`, {password: "Password456"});

        assert.equal(await status(session.api, "/auth/me"), 401);
        assert.equal((await api.post("/auth/login", {email: riya.email, password: "Password456"})).status, 200);
    });

    it("searches users and refuses a status that does not exist", async () => {
        assert.deepEqual((await admin.api.get("/users?search=riya")).body.data.map((user) => user.id), [riya.id]);
        assert.equal((await admin.api.get("/users?status=paused")).status, 422);
    });

    it("deletes a user: they cannot log in and the email is free again", async () => {
        const temp = await addUser(admin, "Temp", "reviewer");
        assert.equal((await admin.api.delete(`/users/${temp.id}`)).status, 200);

        assert.equal((await api.post("/auth/login", {email: temp.email, password: "Password123"})).status, 401);
        assert.equal((await admin.api.post("/users", {name: "Temp", email: temp.email, password: "Password123", roleId: roleId("reviewer")})).status, 201);
    });
});

describe("roles and module permissions", () => {
    let officer;
    let institutionAdmin;
    let readOnly;

    before(async () => {
        await addUser(admin, "Omar", "admissions_officer");
        await addUser(admin, "Isha", "institution_admin");
        await addUser(admin, "Ravi", "read_only");
        officer = await login("omar.pune@yopmail.com", "Password123");
        institutionAdmin = await login("isha.pune@yopmail.com", "Password123");
        readOnly = await login("ravi.pune@yopmail.com", "Password123");
    });

    it("lists the five roles and the modules with their actions", async () => {
        const {roles, modules} = (await admin.api.get("/roles")).body.data;

        assert.deepEqual(roles.map((role) => role.code), ["super_admin", "institution_admin", "admissions_officer", "reviewer", "read_only"]);
        assert.deepEqual(roles.map((role) => role.editable), [false, true, true, true, true]);
        assert.equal(modules.find((module) => module.code === "audit_logs").actions.length, 1);
    });

    it("follows the default permissions", async () => {
        assert.equal((await officer.api.delete("/programs/999999")).status, 403);
        assert.equal((await officer.api.post("/campuses", {})).status, 403);
        assert.equal(await status(officer.api, "/users"), 403);
        assert.equal((await officer.api.post("/programs", {})).status, 422);
        assert.deepEqual((await institutionAdmin.api.post("/users", {})).body.errors, [{message: "You do not have permission to create users"}]);
        assert.deepEqual((await readOnly.api.post("/programs", {name: "X"})).body.errors, [{message: "You do not have permission to create programs"}]);
        assert.equal(await status(readOnly.api, "/programs"), 200);
    });

    it("changes a role's permissions for this tenant, at once, in one audit entry", async () => {
        const saved = await admin.api.put(`/roles/${roleId("admissions_officer")}/permissions`, {permissions: {programs: ALL, audit_logs: NONE}});
        assert.deepEqual([saved.status, saved.body.data.customized, saved.body.data.permissions.programs], [200, true, ALL]);

        assert.equal((await officer.api.delete("/programs/999999")).status, 404);
        assert.equal(await status(officer.api, "/audit-logs"), 403);
        const entries = (await admin.api.get("/audit-logs?module=roles")).body.data;
        assert.deepEqual([entries.total, entries.items[0].changes], [1, {"programs.delete": {from: false, to: true}, "audit_logs.read": {from: true, to: false}}]);
    });

    it("refuses permissions that make no sense, and keeps Super Admin locked", async () => {
        const put = (id, permissions) => admin.api.put(`/roles/${id}/permissions`, {permissions});

        assert.deepEqual((await put(roleId("super_admin"), {programs: READ})).body.errors, [{message: "Super Admin permissions cannot be changed"}]);
        assert.deepEqual((await put(roleId("reviewer"), {audit_logs: ALL})).body.errors, {"permissions.audit_logs": "Audit Logs has no create, update, delete"});
        assert.deepEqual((await put(roleId("reviewer"), {campuses: {...NONE, delete: true}})).body.errors, {"permissions.campuses": "Turn on read to allow create, update or delete"});
        assert.deepEqual((await put(roleId("reviewer"), {bogus: READ})).body.errors, {"permissions.bogus": "Module not found"});
        assert.equal((await institutionAdmin.api.put(`/roles/${roleId("reviewer")}/permissions`, {permissions: {programs: READ}})).status, 403);
    });

    it("lets only a Super Admin add, change or delete a Super Admin", async () => {
        await admin.api.put(`/roles/${roleId("institution_admin")}/permissions`, {permissions: {users: ALL}});
        const attempt = await institutionAdmin.api.post("/users", {name: "Boss", email: "boss.pune@yopmail.com", password: "Password123", roleId: roleId("super_admin")});

        assert.deepEqual(attempt.body.errors, [{message: "Only a Super Admin can add, change or delete a Super Admin"}]);
        assert.equal((await institutionAdmin.api.patch(`/users/${admin.user.id}`, {name: "Hacked"})).status, 403);
        assert.equal((await institutionAdmin.api.post("/users", {name: "Kiran", email: "kiran.pune@yopmail.com", password: "Password123", roleId: roleId("reviewer")})).status, 201);
    });

    it("never lets someone who manages users give an account more access than their own", async () => {
        await admin.api.put(`/roles/${roleId("admissions_officer")}/permissions`, {permissions: {users: {create: true, read: true, update: true, delete: true}}});
        const isha = (await admin.api.get("/users?search=isha")).body.data[0];
        const tooMuch = [{message: "You can only add, change or delete users whose role has no more access than yours"}];

        assert.deepEqual((await officer.api.post("/users", {name: "Sneaky", email: "sneaky.pune@yopmail.com", password: "Password123", roleId: roleId("institution_admin")})).body.errors, tooMuch);
        assert.deepEqual((await officer.api.patch(`/users/${isha.id}`, {password: "Taken12345"})).body.errors, tooMuch);
        assert.equal((await officer.api.delete(`/users/${isha.id}`)).status, 403);
        assert.equal((await officer.api.post("/users", {name: "Olga", email: "olga.pune@yopmail.com", password: "Password123", roleId: roleId("admissions_officer")})).status, 201);
        await admin.api.post(`/roles/${roleId("admissions_officer")}/permissions/reset`);
    });

    it("never lets someone who manages roles raise their own access", async () => {
        await admin.api.put(`/roles/${roleId("institution_admin")}/permissions`, {permissions: {roles: {create: false, read: true, update: true, delete: false}}});
        const put = (code, permissions) => institutionAdmin.api.put(`/roles/${roleId(code)}/permissions`, {permissions});

        assert.deepEqual((await put("institution_admin", {settings: {create: false, read: true, update: true, delete: false}})).body.errors, [{message: "You cannot change the permissions of your own role"}]);
        assert.equal((await institutionAdmin.api.post(`/roles/${roleId("institution_admin")}/permissions/reset`)).status, 403);
        assert.deepEqual((await put("reviewer", {settings: {create: false, read: true, update: true, delete: false}})).body.errors, [{message: "You can only give permissions you have yourself: settings.update"}]);
        assert.equal((await put("reviewer", {programs: READ})).status, 200);
    });

    it("resets a role to the defaults", async () => {
        const reset = await admin.api.post(`/roles/${roleId("admissions_officer")}/permissions/reset`);

        assert.deepEqual([reset.status, reset.body.data.customized], [200, false]);
        assert.equal((await officer.api.delete("/programs/999999")).status, 403);
    });

    it("keeps another tenant's roles at the defaults", async () => {
        const other = await newTenant("Nagpur College", "admin.nagpur@yopmail.com");
        const officerRole = (await other.api.get("/roles")).body.data.roles.find((role) => role.code === "institution_admin");

        assert.deepEqual([officerRole.customized, officerRole.permissions.users], [false, READ]);
    });
});
