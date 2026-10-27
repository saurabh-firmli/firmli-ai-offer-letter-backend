import {describe, it} from "node:test";
import {spawnSync} from "node:child_process";
import assert from "node:assert/strict";
import express from "express";
import Joi from "joi";
import jwt from "jsonwebtoken";
import request from "supertest";

import authService from "../src/v1/services/auth.service.js";
import roleService from "../src/v1/services/role.service.js";
import networkHelper from "../src/v1/helpers/network.helper.js";
import cookieHelper from "../src/v1/helpers/cookie.helper.js";
import {authorize, platformOnly} from "../src/v1/middlewares/auth.middleware.js";
import validate from "../src/v1/middlewares/validate.middleware.js";
import responseHelper from "../src/v1/helpers/response.helper.js";
import {ApiError} from "../src/v1/utils/ApiError.js";
import {HTTP_RESPONSES} from "../src/v1/constants/http-response-messages.constants.js";
import {MODULES} from "../src/v1/constants/module.constants.js";
import {ERROR_CODES} from "../src/v1/constants/error-codes.constants.js";

// A fake request / response pair for one middleware call: what it answered, or whether it let the request through
const run = (middleware, req) => {
    const res = {
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };
    let passed = false;
    middleware(req, res, () => (passed = true));
    return {passed, status: res.statusCode, body: res.body};
};
const userWith = (permissions) => ({user: {permissions}});

describe("tokens", () => {
    it("reads back the user and token version of a login token", () => {
        assert.deepEqual(authService.verifyToken(authService.issueToken(42, 3)), {userId: 42, tokenVersion: 3});
    });

    it("counts a token without a version as version 0", () => {
        const token = jwt.sign({}, process.env.JWT_SECRET, {subject: "7", algorithm: "HS256"});

        assert.deepEqual(authService.verifyToken(token), {userId: 7, tokenVersion: 0});
    });

    it("refuses an expired token", () => {
        const token = jwt.sign({ver: 0, exp: Math.floor(Date.now() / 1000) - 10}, process.env.JWT_SECRET, {subject: "7", algorithm: "HS256"});

        assert.throws(() => authService.verifyToken(token), /expired/);
    });

    it("refuses a token signed with another secret", () => {
        const token = jwt.sign({ver: 0}, "another-secret-that-is-at-least-32-characters", {subject: "7", algorithm: "HS256"});

        assert.throws(() => authService.verifyToken(token));
    });

    it('refuses an unsigned token (algorithm "none")', () => {
        const token = jwt.sign({ver: 0}, null, {subject: "7", algorithm: "none"});

        assert.throws(() => authService.verifyToken(token));
    });

    it("refuses a token made for another purpose, both ways", () => {
        const ticket = authService.sign(7, 0, {purpose: "events", expiresIn: 60});
        const login = authService.issueToken(7, 0);

        assert.throws(() => authService.verifyToken(ticket), /Not a login token/);
        assert.throws(() => authService.verifyEventsTicket(login), /Not a events ticket/);
        assert.deepEqual(authService.verifyEventsTicket(ticket), {userId: 7, tokenVersion: 0});
    });

    it("refuses a token whose payload was edited", () => {
        const [header, , signature] = authService.issueToken(7, 0).split(".");
        const payload = Buffer.from(JSON.stringify({sub: "1", ver: 0})).toString("base64url");

        assert.throws(() => authService.verifyToken(`${header}.${payload}.${signature}`));
    });
});

describe("authorize", () => {
    it("takes the action from the HTTP method", () => {
        const programs = {programs: {create: false, read: true, update: false, delete: false}};

        assert.equal(run(authorize(MODULES.PROGRAMS), {method: "GET", ...userWith(programs)}).passed, true);
        assert.equal(run(authorize(MODULES.PROGRAMS), {method: "POST", ...userWith(programs)}).passed, false);
        assert.equal(run(authorize(MODULES.PROGRAMS), {method: "PATCH", ...userWith(programs)}).passed, false);
        assert.equal(run(authorize(MODULES.PROGRAMS), {method: "DELETE", ...userWith(programs)}).passed, false);
    });

    it("answers 403 with which action and module were missing", () => {
        const answer = run(authorize(MODULES.LETTER_TEMPLATES), {method: "DELETE", ...userWith({letter_templates: {read: true}})});

        assert.equal(answer.status, 403);
        assert.deepEqual(answer.body.errors, [{message: "You do not have permission to delete letter templates"}]);
    });

    it("treats a POST as update in a module without create (Manual Review, Settings, Roles)", () => {
        const updateOnly = userWith({reviews: {read: true, update: true}, settings: {read: true, update: true}, roles: {read: true, update: true}});
        const readOnly = userWith({reviews: {read: true}, settings: {read: true}, roles: {read: true}});

        for (const module of [MODULES.REVIEWS, MODULES.SETTINGS, MODULES.ROLES]) {
            assert.equal(run(authorize(module), {method: "POST", ...updateOnly}).passed, true, module);
            assert.equal(run(authorize(module), {method: "POST", ...readOnly}).passed, false, module);
        }
    });

    it("treats a DELETE as update in a module without delete (removing the Settings logo)", () => {
        assert.equal(run(authorize(MODULES.SETTINGS), {method: "DELETE", ...userWith({settings: {read: true, update: true}})}).passed, true);
        assert.equal(run(authorize(MODULES.SETTINGS), {method: "DELETE", ...userWith({settings: {read: true}})}).passed, false);
    });

    it("keeps create for a module that has it (Letters, Communications)", () => {
        const updateOnly = userWith({letters: {read: true, update: true}});

        assert.equal(run(authorize(MODULES.LETTERS), {method: "POST", ...updateOnly}).passed, false);
        assert.equal(run(authorize(MODULES.LETTERS, "update"), {method: "POST", ...updateOnly}).passed, true);
    });

    it("refuses a user without that module, or a request without a user", () => {
        assert.equal(run(authorize(MODULES.USERS), {method: "GET", ...userWith({})}).passed, false);
        assert.equal(run(authorize(MODULES.USERS), {method: "GET"}).passed, false);
    });
});

describe("platformOnly", () => {
    it("lets only a Super Admin of the platform tenant (Firmli) through", () => {
        assert.equal(run(platformOnly, {user: {role: "super_admin", tenant: {isPlatform: true}}}).passed, true);
        assert.equal(run(platformOnly, {user: {role: "super_admin", tenant: {isPlatform: false}}}).status, 403);
        assert.equal(run(platformOnly, {}).status, 403);
    });

    it("keeps out Firmli staff with any other role", () => {
        for (const role of ["institution_admin", "admissions_officer", "reviewer", "read_only"]) {
            assert.equal(run(platformOnly, {user: {role, tenant: {isPlatform: true}}}).status, 403, role);
        }
    });
});

describe("error answers", () => {
    it("carry a stable code when one is given, null otherwise", () => {
        assert.equal(ApiError.of(HTTP_RESPONSES.HTTP_FORBIDDEN, "Blocked", ERROR_CODES.TENANT_BLOCKED).toJSON().code, "TENANT_BLOCKED");
        assert.equal(ApiError.of(HTTP_RESPONSES.HTTP_NOT_FOUND, "Program not found").toJSON().code, null);
        assert.equal(ApiError.validation({name: "Required"}).toJSON().code, null);
    });

    it("keep field errors as an object on 422 and messages as a list otherwise", () => {
        assert.deepEqual(ApiError.validation({name: "Required"}).toJSON().errors, {name: "Required"});
        assert.deepEqual(ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, "Duplicate").toJSON().errors, [{message: "Duplicate"}]);
    });

    it("turn {value: label} constants into dropdown options", () => {
        assert.deepEqual(responseHelper.labelOptions({draft: "Draft", published: "Published"}), [
            {value: "draft", label: "Draft"},
            {value: "published", label: "Published"},
        ]);
        assert.deepEqual(responseHelper.labelOptions({}), []);
    });
});

describe("validate middleware", () => {
    const app = express();
    app.use(express.json());
    const schema = Joi.object({name: Joi.string().trim().required(), address: Joi.object({city: Joi.string().required()}), page: Joi.number().default(1)});
    app.post("/body", validate(schema), (req, res) => res.json(req.body));
    app.get("/query", validate(Joi.object({page: Joi.number().integer().min(1).default(1), search: Joi.string()}), "query"), (req, res) => res.json(req.query));

    it("answers every invalid field at once, nested ones with a dotted path", async () => {
        const res = await request(app).post("/body").send({address: {}});

        assert.equal(res.status, 422);
        assert.deepEqual(Object.keys(res.body.errors).sort(), ["address.city", "name"]);
    });

    it("hands the handler the converted values (trimmed, defaults filled in)", async () => {
        const res = await request(app).post("/body").send({name: "  Riya  "});

        assert.deepEqual(res.body, {name: "Riya", page: 1});
    });

    it("converts query strings too (Express 5 query is read only, so values are copied in)", async () => {
        assert.deepEqual((await request(app).get("/query?page=3")).body, {page: 3});
        assert.deepEqual((await request(app).get("/query")).body, {page: 1});
        assert.equal((await request(app).get("/query?page=0")).status, 422);
    });

    it("puts an error about the whole body under the source name", async () => {
        const res = await request(app).post("/body").set("Content-Type", "application/json").send("[]");

        assert.equal(res.status, 422);
        assert.ok(res.body.errors.body);
    });
});

describe("giving role permissions", () => {
    const officerRole = {id: 3, name: "Admissions Officer"};
    const institutionAdmin = {role: "institution_admin", roleId: 2, permissions: {roles: {read: true, update: true}, programs: {create: true, read: true, update: true, delete: true}}};
    const turnOn = (...keys) => Object.fromEntries(keys.map((key) => [key, {from: false, to: true}]));

    it("lets a Super Admin give anything", () => {
        assert.doesNotThrow(() => roleService.assertMayGrant(officerRole, turnOn("users.delete", "settings.update"), {role: "super_admin", roleId: 1, permissions: {}}));
    });

    it("lets anyone else give only what they have themselves", () => {
        assert.doesNotThrow(() => roleService.assertMayGrant(officerRole, turnOn("programs.delete"), institutionAdmin));
        assert.throws(() => roleService.assertMayGrant(officerRole, turnOn("programs.delete", "users.create", "settings.update"), institutionAdmin), (error) =>
            error.statusCode === 403 && error.message === "You can only give permissions you have yourself: users.create, settings.update"
        );
    });

    it("lets them take away what they lack, but never change their own role", () => {
        assert.doesNotThrow(() => roleService.assertMayGrant(officerRole, {"users.read": {from: true, to: false}}, institutionAdmin));
        assert.throws(() => roleService.assertMayGrant({id: 2, name: "Institution Admin"}, {}, institutionAdmin), {message: "You cannot change the permissions of your own role"});
    });
});

describe("internal addresses (a client's SMTP server)", () => {
    it("knows loopback, private, link-local, carrier-grade NAT and IPv6 local addresses", () => {
        for (const address of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
            assert.equal(networkHelper.isInternal(address), true, address);
        }
        for (const address of ["8.8.8.8", "172.32.0.1", "142.250.183.14", "2a00:1450:4009:81f::200e"]) {
            assert.equal(networkHelper.isInternal(address), false, address);
        }
    });

    it("answers the public address of a host, and null for one that is or resolves to an internal one", async () => {
        assert.equal(await networkHelper.publicAddressOf("8.8.8.8"), "8.8.8.8");
        assert.equal(await networkHelper.publicAddressOf("127.0.0.1"), null);
        assert.equal(await networkHelper.publicAddressOf("localhost"), null);
    });
});

describe("TRUST_PROXY", () => {
    // The config is read once per process, so each value is tried in a fresh one
    const trustProxyWith = (value) => {
        const child = spawnSync(process.execPath, ["--input-type=module", "-e", "const {default: config} = await import('./src/v1/configs/env.config.js'); console.log(JSON.stringify(config.trustProxy));"], {
            env: {...process.env, TRUST_PROXY: value},
            encoding: "utf8",
        });
        return child.status === 0 ? JSON.parse(child.stdout) : child.stderr;
    };

    it("is a number of proxies (0 for none, false still means none)", () => {
        assert.deepEqual(["0", "1", "2", "false", ""].map(trustProxyWith), [0, 1, 2, 0, 0]);
    });

    it("refuses true, which would let anyone fake their IP through X-Forwarded-For", () => {
        for (const value of ["true", "yes", "-1", "11"]) assert.match(trustProxyWith(value), /TRUST_PROXY must be the number of proxies/, value);
    });
});

describe("sessions", () => {
    it("puts the session id in the access token, and leaves it out of an older token", () => {
        assert.deepEqual(authService.verifyToken(authService.issueToken(42, 3, 17)), {userId: 42, tokenVersion: 3, sessionId: 17});
        assert.deepEqual(authService.verifyToken(authService.issueToken(42, 3)), {userId: 42, tokenVersion: 3});
    });

    it("reads the refresh cookie among other cookies, and nothing without it", () => {
        const req = (cookie) => ({get: (name) => (name === "Cookie" ? cookie : undefined)});

        assert.equal(cookieHelper.readRefresh(req("theme=dark; firmli_refresh=abc-DEF_123; lang=en")), "abc-DEF_123");
        assert.equal(cookieHelper.readRefresh(req("theme=dark")), null);
        assert.equal(cookieHelper.readRefresh(req(undefined)), null);
        assert.equal(cookieHelper.readRefresh(req("firmli_refresh=")), null);
    });

    it("refuses COOKIE_SAME_SITE=none without a secure cookie", () => {
        const child = spawnSync(process.execPath, ["--input-type=module", "-e", "await import('./src/v1/configs/env.config.js');"], {
            env: {...process.env, COOKIE_SAME_SITE: "none", COOKIE_SECURE: "false"},
            encoding: "utf8",
        });
        assert.match(child.stderr, /COOKIE_SAME_SITE=none needs COOKIE_SECURE=true/);
    });
});
