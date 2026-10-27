import {describe, it} from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import jwt from "jsonwebtoken";

import firmliOfferLetterApp from "../src/v1/firmliOfferLetterApp.js";
import authService from "../src/v1/services/auth.service.js";

// The app without a database: what every request goes through before any data is read
describe("app", () => {
    it("GET /v1/health answers 200 with the service status", async () => {
        const res = await request(firmliOfferLetterApp).get("/v1/health");

        assert.equal(res.status, 200);
        assert.equal(res.body.success, true);
        assert.equal(res.body.data.service, "firmli-ai-offer-letter-backend");
        assert.equal(res.body.data.database, "not_configured");
        assert.equal(res.body.data.queue, "not_configured");
    });

    it("gives every response a request id", async () => {
        const res = await request(firmliOfferLetterApp).get("/v1/health");

        assert.match(res.headers["x-request-id"], /^[0-9a-f-]{36}$/);
    });

    it("answers 404 in the error shape for an unknown route", async () => {
        const res = await request(firmliOfferLetterApp).get("/v1/does-not-exist");

        assert.equal(res.status, 404);
        assert.equal(res.body.success, false);
        assert.deepEqual(res.body.errors, [{message: "/v1/does-not-exist endpoint is not found."}]);
        assert.equal(res.body.code, null);
    });

    it("answers 400 for invalid JSON", async () => {
        const res = await request(firmliOfferLetterApp)
            .post("/v1/auth/login")
            .set("Content-Type", "application/json")
            .send("{not json");

        assert.equal(res.status, 400);
        assert.equal(res.body.success, false);
    });
});

describe("login and tokens", () => {
    it("refuses a protected route without a token", async () => {
        const res = await request(firmliOfferLetterApp).get("/v1/auth/me");

        assert.equal(res.status, 401);
        assert.deepEqual(res.body.errors, [{message: "Login required"}]);
        assert.equal(res.body.code, "LOGIN_REQUIRED");
    });

    it("refuses a made-up token", async () => {
        const res = await request(firmliOfferLetterApp).get("/v1/programs").set("Authorization", "Bearer not.a.token");

        assert.equal(res.status, 401);
        assert.deepEqual(res.body.errors, [{message: "Session expired or invalid, please log in again"}]);
        assert.equal(res.body.code, "SESSION_ENDED");
    });

    it("refuses the platform panel without a token", async () => {
        const res = await request(firmliOfferLetterApp).get("/v1/platform/tenants");

        assert.equal(res.status, 401);
    });

    it("checks the login fields before anything else", async () => {
        const res = await request(firmliOfferLetterApp).post("/v1/auth/login").send({email: "not-an-email"});

        assert.equal(res.status, 422);
        assert.ok(res.body.errors.email);
        assert.ok(res.body.errors.password);
    });

    it("opens the live updates stream only with an events ticket", async () => {
        const noTicket = await request(firmliOfferLetterApp).get("/v1/events");
        const loginToken = await request(firmliOfferLetterApp).get(`/v1/events?ticket=${authService.issueToken(1, 0)}`);

        assert.equal(noTicket.status, 401);
        assert.deepEqual(loginToken.body.errors, [{message: "Events ticket expired or invalid; ask for a new one"}]);
        assert.equal(loginToken.body.code, "EVENTS_TICKET_INVALID");
    });

    it("never takes an events ticket as a login token", async () => {
        const ticket = jwt.sign({ver: 0, purpose: "events"}, process.env.JWT_SECRET, {subject: "1", expiresIn: 60, algorithm: "HS256"});
        const res = await request(firmliOfferLetterApp).get("/v1/auth/me").set("Authorization", `Bearer ${ticket}`);

        assert.equal(res.status, 401);
        assert.deepEqual(authService.verifyEventsTicket(ticket), {userId: 1, tokenVersion: 0});
    });

    it("asks for a login when the Authorization header is not 'Bearer <token>'", async () => {
        for (const header of ["Basic dXNlcjpwYXNz", "Bearer", "Bearer ", "bearer abc", "abc"]) {
            const res = await request(firmliOfferLetterApp).get("/v1/auth/me").set("Authorization", header);
            assert.deepEqual([res.status, res.body.code], [401, "LOGIN_REQUIRED"], header);
        }
    });

    it("keeps every module behind the login", async () => {
        const routes = [
            ["get", "/v1/dropdowns/programs"], ["get", "/v1/dropdowns/roles"], ["get", "/v1/applications"], ["post", "/v1/applications"],
            ["get", "/v1/settings"], ["put", "/v1/settings/logo"], ["get", "/v1/letter-templates/1/preview-pdf?applicationId=1"],
            ["get", "/v1/reports/export"], ["post", "/v1/platform/tenants/1/users/2/send-credentials"], ["get", "/v1/audit-logs"],
            ["get", "/v1/notifications"], ["post", "/v1/events/ticket"], ["get", "/v1/users"], ["delete", "/v1/programs/1"],
        ];
        for (const [method, path] of routes) {
            const res = await request(firmliOfferLetterApp)[method](path);
            assert.equal(res.status, 401, `${method.toUpperCase()} ${path}`);
        }
    });

    it("answers 413 for a body over 1 MB", async () => {
        const res = await request(firmliOfferLetterApp).post("/v1/auth/login").send({email: "a@yopmail.com", password: "x".repeat(1024 * 1024 + 10)});

        assert.equal(res.status, 413);
        assert.equal(res.body.success, false);
    });

    it("checks the reset password fields", async () => {
        const res = await request(firmliOfferLetterApp).post("/v1/auth/reset-password").send({token: "", password: "short"});

        assert.equal(res.status, 422);
        assert.ok(res.body.errors.password);
    });

    it("checks the forgot password email", async () => {
        const res = await request(firmliOfferLetterApp).post("/v1/auth/forgot-password").send({});

        assert.equal(res.status, 422);
        assert.ok(res.body.errors.email);
    });
});
