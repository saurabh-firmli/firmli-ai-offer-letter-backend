import {before, describe, it} from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import {startApp} from "./context.js";

// Sessions: a 15-minute access token, and a refresh token in an httpOnly cookie that gets a new one on each refresh
process.env.CORS_ORIGINS = "http://localhost:3005";
const {api, client, login, newTenant, refreshCookieOf, models} = await startApp();

const refresh = (cookie, origin) => {
    const test = api.post("/auth/refresh");
    if (cookie) test.set("Cookie", cookie);
    if (origin) test.set("Origin", origin);
    return test;
};
const me = async (token) => (await client(token).get("/auth/me")).status;

let admin;
let roleId;
const addUser = async (name) => {
    const email = `${name.toLowerCase()}.sess@yopmail.com`;
    await admin.api.post("/users", {name, email, password: "Password123", roleId: roleId("admissions_officer")});
    return email;
};

before(async () => {
    admin = await newTenant("Session College", "admin.sess@yopmail.com");
    const roles = (await admin.api.get("/roles")).body.data.roles;
    roleId = (code) => roles.find((role) => role.code === code).id;
});

describe("login and refresh", () => {
    it("gives a 15-minute access token, and the refresh token only as an httpOnly cookie for /v1/auth", async () => {
        const res = await api.post("/auth/login", {email: "admin.sess@yopmail.com", password: "Password123"});
        const cookieLine = res.headers["set-cookie"].find((line) => line.startsWith("firmli_refresh="));
        const {exp, iat, sid} = jwt.decode(res.body.data.token);

        assert.equal(exp - iat, 15 * 60);
        assert.ok(sid);
        assert.match(cookieLine, /HttpOnly/i);
        assert.match(cookieLine, /Path=\/v1\/auth/);
        assert.match(cookieLine, /SameSite=Lax/i);
        assert.deepEqual(Object.keys(res.body.data).sort(), ["token", "user"]);
    });

    it("gives a new access token and a new refresh token for the cookie", async () => {
        const session = await login("admin.sess@yopmail.com", "Password123");
        const res = await refresh(session.cookie);

        assert.equal(res.status, 200);
        assert.equal(res.body.data.user.email, "admin.sess@yopmail.com");
        assert.equal(await me(res.body.data.token), 200);
        assert.notEqual(refreshCookieOf(res), session.cookie);
        assert.equal(jwt.decode(res.body.data.token).sid, jwt.decode(session.token).sid);
    });

    it("lets a second tab use the replaced cookie a moment later, without a new cookie", async () => {
        const session = await login("admin.sess@yopmail.com", "Password123");
        await refresh(session.cookie);
        const second = await refresh(session.cookie);

        assert.equal(second.status, 200);
        assert.equal(refreshCookieOf(second), null);
    });

    it("ends the session when a replaced cookie comes back later: it was copied", async () => {
        const session = await login("admin.sess@yopmail.com", "Password123");
        const first = await refresh(session.cookie);
        const newest = refreshCookieOf(first);
        await models.sequelize.query("UPDATE user_sessions SET rotated_at = NOW() - INTERVAL 5 MINUTE WHERE id = :id", {replacements: {id: jwt.decode(session.token).sid}});

        const replay = await refresh(session.cookie);
        assert.deepEqual([replay.status, replay.body.code], [401, "SESSION_ENDED"]);
        assert.equal((await refresh(newest)).status, 401);
        assert.equal(await me(first.body.data.token), 401);
    });

    it("refuses no cookie or a made-up one, and clears the cookie", async () => {
        const none = await refresh(null);
        const madeUp = await refresh("firmli_refresh=made-up");

        assert.deepEqual([none.status, none.body.code, madeUp.status], [401, "SESSION_ENDED", 401]);
        assert.ok(madeUp.headers["set-cookie"].some((line) => /^firmli_refresh=;/.test(line)));
    });

    it("refuses a refresh sent from a site that is not the frontend", async () => {
        const session = await login("admin.sess@yopmail.com", "Password123");

        assert.equal((await refresh(session.cookie, "https://evil.example.com")).status, 403);
        assert.equal((await refresh(session.cookie, "http://localhost:3005")).status, 200);
    });
});

describe("logout", () => {
    it("logs out this device only", async () => {
        const email = await addUser("Lara");
        const laptop = await login(email, "Password123");
        const phone = await login(email, "Password123");

        assert.equal((await laptop.api.post("/auth/logout")).status, 200);
        assert.deepEqual([await me(laptop.token), (await refresh(laptop.cookie)).status], [401, 401]);
        assert.deepEqual([await me(phone.token), (await refresh(phone.cookie)).status], [200, 200]);
    });

    it("logs out with only the cookie, once the access token has expired", async () => {
        const email = await addUser("Kofi");
        const session = await login(email, "Password123");

        assert.equal((await api.post("/auth/logout").set("Cookie", session.cookie)).status, 200);
        assert.equal((await refresh(session.cookie)).status, 401);
    });

    it("logs out of every device", async () => {
        const email = await addUser("Mira");
        const laptop = await login(email, "Password123");
        const phone = await login(email, "Password123");

        assert.equal((await laptop.api.post("/auth/logout-all")).status, 200);
        assert.deepEqual([await me(laptop.token), await me(phone.token), (await refresh(phone.cookie)).status], [401, 401, 401]);
    });

    it("ends the live updates tickets of the session too", async () => {
        const email = await addUser("Tomi");
        const session = await login(email, "Password123");
        const {ticket} = (await session.api.post("/events/ticket")).body.data;
        await session.api.post("/auth/logout");

        assert.equal((await api.get(`/events?ticket=${ticket}`)).status, 401);
    });
});

describe("password changes and access changes", () => {
    it("keeps this device logged in after a password change and logs out the others", async () => {
        const email = await addUser("Nadia");
        const here = await login(email, "Password123");
        const elsewhere = await login(email, "Password123");

        const changed = await here.api.post("/auth/change-password", {currentPassword: "Password123", newPassword: "Password456"});
        assert.equal(changed.status, 200);
        assert.equal(await me(changed.body.data.token), 200);
        assert.equal((await refresh(here.cookie)).status, 200);
        assert.deepEqual([await me(elsewhere.token), (await refresh(elsewhere.cookie)).status], [401, 401]);
    });

    it("logs the user out everywhere when an admin sets their password", async () => {
        const email = await addUser("Femi");
        const session = await login(email, "Password123");
        await admin.api.patch(`/users/${session.user.id}`, {password: "Password789"});

        assert.equal((await refresh(session.cookie)).status, 401);
    });

    it("refuses a blocked user's refresh with the reason, and ends the session", async () => {
        const email = await addUser("Bayo");
        const session = await login(email, "Password123");
        await admin.api.patch(`/users/${session.user.id}`, {status: "blocked"});

        const res = await refresh(session.cookie);
        assert.deepEqual([res.status, res.body.code], [401, "ACCOUNT_NOT_ACTIVE"]);
        await admin.api.patch(`/users/${session.user.id}`, {status: "active"});
        assert.equal((await refresh(session.cookie)).status, 401);
    });
});

describe("switch user and back", () => {
    it("lets Firmli staff switch into a user and back, without logging in again", async () => {
        const staff = await newTenant("Firmli", "staff.sess@yopmail.com", {isPlatform: true});
        const switched = await staff.api.post("/dev/switch-user", {userId: admin.user.id});
        const switchedCookie = refreshCookieOf(switched);
        assert.deepEqual([switched.status, switched.body.data.user.email], [200, "admin.sess@yopmail.com"]);
        assert.ok(switchedCookie);

        const back = await client(switched.body.data.token).post("/auth/switch-back").set("Cookie", switchedCookie);
        assert.deepEqual([back.status, back.body.data.user.email], [200, "staff.sess@yopmail.com"]);
        assert.ok(refreshCookieOf(back));
        assert.equal(await me(switched.body.data.token), 401);
    });

    it("refuses switch back from a session that was not switched into", async () => {
        const res = await admin.api.post("/auth/switch-back");

        assert.equal(res.status, 409);
    });
});
