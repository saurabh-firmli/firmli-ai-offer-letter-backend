import {after} from "node:test";
import request from "supertest";
import {fakeAiServer, fakeMailServer, waitUntil} from "./fakes.js";
import testDatabase from "./database.js";

/**
 * Starts what one *.flow.js file needs: its own new database, the fake mail and AI servers, then the app
 * on them (with the email retry loop and in-process AI jobs, as bin/www does). After the file's tests
 * everything is closed and the database dropped (kept with npm run test:db -- --keep).
 *
 *   const {api, mail, ai, newTenant} = await startApp();
 *   const apex = await newTenant("Apex University", "apex.admin@yopmail.com");
 *   const res = await apex.api.get("/programs");
 */
export const startApp = async () => {
    if (!process.env.TEST_DB_RUN) throw new Error("Run the flows with npm run test:db");
    const database = `${process.env.TEST_DB_RUN}_${process.pid}`;
    await testDatabase.create(database);

    const mail = await fakeMailServer();
    const ai = await fakeAiServer();
    Object.assign(process.env, {
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: String(mail.port),
        SMTP_SECURE: "false",
        SMTP_USER: "",
        SMTP_PASSWORD: "",
        MAIL_FROM: "Firmli Test <no-reply@yopmail.com>",
        OPENAI_BASE_URL: `http://127.0.0.1:${ai.port}/v1`,
        FIRMLI_DB_DATABASE: database,
        S3_KEY_PREFIX: `${process.env.S3_KEY_PREFIX}${database}/`,
    });

    // Imported only now: the config is read once, from the env set above
    const {default: app} = await import("../../src/v1/firmliOfferLetterApp.js");
    const {default: databaseModel, initDatabase, closeDatabase} = await import("../../src/v1/utils/database.util.js");
    const {default: dbHelper} = await import("../../src/v1/helpers/db.helper.js");
    const {default: platformService} = await import("../../src/v1/services/platform.service.js");
    const {default: realtimeHelper} = await import("../../src/v1/helpers/realtime.helper.js");
    const {default: automationService} = await import("../../src/v1/services/automation.service.js");
    await initDatabase();
    await automationService.startBackground();

    after(async () => {
        realtimeHelper.close();
        await closeDatabase();
        await Promise.all([mail.close(), ai.close()]);
        if (!process.env.TEST_DB_KEEP) await testDatabase.dropAll(database);
    });

    // api.get("/programs"), api.post("/programs", body): supertest requests under /v1, logged in with `token`
    const client = (token) =>
        Object.fromEntries(
            ["get", "post", "put", "patch", "delete"].map((method) => [
                method,
                (path, body) => {
                    const test = request(app)[method](`/v1${path}`);
                    if (token) test.set("Authorization", `Bearer ${token}`);
                    return body === undefined ? test : test.send(body);
                },
            ])
        );
    const api = client(null);

    // "firmli_refresh=..." from a response's Set-Cookie, ready to send back in a Cookie header; null without one
    const refreshCookieOf = (res) => (res.headers["set-cookie"] ?? []).map((line) => line.split(";")[0]).find((pair) => /^firmli_refresh=./.test(pair)) ?? null;

    const login = async (email, password) => {
        const res = await api.post("/auth/login", {email, password});
        if (res.status !== 200) throw new Error(`Login of ${email} answered ${res.status}: ${JSON.stringify(res.body.errors)}`);
        return {token: res.body.data.token, user: res.body.data.user, api: client(res.body.data.token), cookie: refreshCookieOf(res)};
    };

    /**
     * A tenant with its Super Admin, made as `npm run create-tenant` does, and that admin logged in.
     * isPlatform: Firmli's own tenant (Platform admin panel, switch user).
     */
    const newTenant = async (name, adminEmail, {code, password = "Password123", isPlatform = false} = {}) => {
        const tenant = await platformService.create({name, code, admin: {name: `${name} Admin`, email: adminEmail, password}});
        if (isPlatform) await databaseModel.tenant.update({isPlatform: true}, {where: {id: tenant.id}});
        return {tenant, password, ...(await login(adminEmail, password))};
    };

    return {app, api, client, login, newTenant, refreshCookieOf, mail, ai, db: dbHelper, models: databaseModel, waitUntil};
};

// A small PDF / PNG / DOCX that passes the upload checks (the content is not read: the AI is fake)
export const files = {
    pdf: (text = "test") => Buffer.from(`%PDF-1.4\n% ${text}\n%%EOF\n`),
    png: () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]),
};
