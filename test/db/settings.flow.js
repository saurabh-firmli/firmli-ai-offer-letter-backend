import {before, describe, it} from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import {startApp} from "./context.js";

// Settings and branding, notes, the bell, the audit log's who-sees-what, letter preview, live updates
const {app, api, login, newTenant, mail} = await startApp();

// A real 1 x 1 PNG, so the logo can go into a PDF and an email
const png = () => {
    const crcTable = Array.from({length: 256}, (_, n) => {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        return c >>> 0;
    });
    const crc = (buffer) => {
        let c = 0xffffffff;
        for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
    };
    const chunk = (type, data) => {
        const body = Buffer.concat([Buffer.from(type), data]);
        const length = Buffer.alloc(4);
        const sum = Buffer.alloc(4);
        length.writeUInt32BE(data.length);
        sum.writeUInt32BE(crc(body));
        return Buffer.concat([length, body, sum]);
    };
    const header = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(Buffer.from([0, 15, 118, 110]))), chunk("IEND", Buffer.alloc(0))]);
};

// A GET that answers a file, with the bytes in res.body
const pdfOf = (path) =>
    admin.api
        .get(path)
        .buffer(true)
        .parse((res, done) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => done(null, Buffer.concat(chunks)));
        });

let admin;
let officer;
let other;
let application;
let template;

before(async () => {
    admin = await newTenant("Kingston College", "admin.kc@yopmail.com");
    other = await newTenant("Other College", "admin.other@yopmail.com");
    const roles = (await admin.api.get("/dropdowns/roles")).body.data;
    await admin.api.post("/users", {name: "Olu Officer", email: "olu.kc@yopmail.com", password: "Password123", roleId: roles.find((role) => role.code === "admissions_officer").value});
    officer = await login("olu.kc@yopmail.com", "Password123");

    const campus = (await admin.api.post("/campuses", {name: "Kingston", cityId: 3})).body.data;
    template = (await admin.api.post("/letter-templates", {name: "Offer", letterType: "conditional_offer", referencePrefix: "KC", subject: "Offer for {{student_full_name}}", body: "<p>Dear {{student_full_name}}, welcome to {{program_name}}.</p>", status: "published"})).body.data;
    const program = (await admin.api.post("/programs", {name: "MSc Finance", code: "MSF", campusId: campus.id, duration: "1 year", status: "active", conditionalOfferTemplateId: template.id})).body.data;
    application = (await officer.api.post("/applications", {student: {firstName: "Grace", lastName: "Hall", email: "grace.kc@yopmail.com"}, programId: program.id, intakeTerm: "fall", intakeYear: new Date().getUTCFullYear()})).body.data;
});

describe("health", () => {
    it("says the database is up", async () => {
        const health = (await api.get("/health")).body.data;

        assert.deepEqual([health.database, health.queue], ["up", "not_configured"]);
    });
});

describe("settings", () => {
    it("never answers secrets: the OpenAI key shows only its last 4 characters", async () => {
        const saved = (await admin.api.patch("/settings", {openaiApiKey: "sk-test-abcdefghijklmnop1234", address: "1 Penrhyn Road, Kingston", brandColor: "#0f766e"})).body.data;

        assert.deepEqual([saved.openaiApiKey, saved.aiConfigured, saved.brandColor], ["sk-...1234", true, "#0F766E"]);
        assert.equal(JSON.stringify((await admin.api.get("/settings")).body.data).includes("abcdefghijklmnop"), false);
        assert.deepEqual((await admin.api.patch("/settings", {openaiApiKey: "not-a-key"})).body.errors, {openaiApiKey: "Enter a valid OpenAI API key (it starts with sk-)"});
    });

    it("keeps settings to their tenant and to those allowed", async () => {
        assert.equal((await other.api.get("/settings")).body.data.name, "Other College");
        assert.equal((await officer.api.patch("/settings", {address: "x"})).status, 403);
    });

    it("uploads a logo, shows it with a short-lived link, and puts it on the letters", async () => {
        const saved = await admin.api.put("/settings/logo").attach("file", png(), {filename: "logo.png", contentType: "image/png"});
        assert.equal(saved.status, 200, JSON.stringify(saved.body.errors));
        const image = await fetch(saved.body.data.logo.url);
        assert.deepEqual([image.status, Buffer.from(await image.arrayBuffer()).equals(png())], [200, true]);

        const preview = await pdfOf(`/letter-templates/${template.id}/preview-pdf?applicationId=${application.id}`);
        assert.ok(preview.body.includes(Buffer.from("/Subtype /Image")));
    });

    it("sends a test email to the address asked for", async () => {
        const sent = await admin.api.post("/settings/test-email", {to: "check.kc@yopmail.com"});

        assert.deepEqual([sent.status, sent.body.data.sentTo], [200, "check.kc@yopmail.com"]);
        assert.equal((await mail.waitFor((message) => message.to.includes("check.kc@yopmail.com"))).subject, "Kingston College: test email");
    });

    it("refuses a logo that is not a PNG or JPG, and removes the logo", async () => {
        const pdf = await admin.api.put("/settings/logo").attach("file", Buffer.from("%PDF-1.4\n"), {filename: "logo.pdf", contentType: "application/pdf"});
        assert.deepEqual(pdf.body.errors, {file: "Upload a PNG or JPG image"});

        assert.equal((await admin.api.delete("/settings/logo")).body.data.logo, null);
    });
});

describe("one application's notes, officer and letter preview", () => {
    it("adds notes that only the tenant sees", async () => {
        assert.equal((await officer.api.post(`/applications/${application.id}/notes`, {note: "Called the student <today>"})).status, 201);

        const notes = (await admin.api.get(`/applications/${application.id}/notes`)).body.data;
        assert.equal(JSON.stringify(notes).includes("Called the student <today>"), true);
        assert.equal((await other.api.get(`/applications/${application.id}/notes`)).status, 404);
        assert.equal((await officer.api.post(`/applications/${application.id}/notes`, {note: "   "})).status, 422);
    });

    it("assigns an officer of the tenant only", async () => {
        assert.equal((await admin.api.put(`/applications/${application.id}/officer`, {officerId: officer.user.id})).body.data.officer.id, officer.user.id);
        assert.equal((await admin.api.put(`/applications/${application.id}/officer`, {officerId: other.user.id})).status, 422);
    });

    it("previews a letter template on an application as a PDF, saving nothing", async () => {
        const preview = await pdfOf(`/letter-templates/${template.id}/preview-pdf?applicationId=${application.id}`);

        assert.equal(preview.status, 200);
        assert.equal(preview.headers["content-type"], "application/pdf");
        assert.equal(preview.body.subarray(0, 5).toString(), "%PDF-");
        assert.deepEqual((await admin.api.get(`/applications/${application.id}/letters`)).body.data, []);
        assert.equal((await other.api.get(`/letter-templates/${template.id}/preview-pdf?applicationId=${application.id}`)).status, 404);
    });
});

describe("audit log and the bell", () => {
    it("shows the Super Admin every change, and everyone else only their own", async () => {
        const all = (await admin.api.get("/audit-logs?limit=100")).body.data.items;
        const own = (await officer.api.get("/audit-logs?limit=100")).body.data.items;

        assert.ok(all.some((entry) => entry.userId === admin.user.id));
        assert.ok(own.length > 0);
        assert.ok(own.every((entry) => entry.userId === officer.user.id));
    });

    it("answers the bell with a total and items", async () => {
        const bell = (await admin.api.get("/notifications")).body.data;

        assert.equal(typeof bell.total, "number");
        assert.ok(Array.isArray(bell.items));
    });
});

describe("dropdowns of people", () => {
    it("lists the tenant's users with their role, and the roles with their code", async () => {
        const users = (await admin.api.get("/dropdowns/users")).body.data;
        const roles = (await officer.api.get("/dropdowns/roles")).body.data;

        assert.deepEqual(users.map((user) => user.label), ["Kingston College Admin (Super Admin)", "Olu Officer (Admissions Officer)"]);
        assert.deepEqual(roles.map((role) => role.code), ["super_admin", "institution_admin", "admissions_officer", "reviewer", "read_only"]);
    });
});

describe("live updates", () => {
    it("opens the stream with a one-minute ticket, and says ready", async () => {
        const ticket = (await admin.api.post("/events/ticket")).body.data.ticket;
        const server = app.listen(0, "127.0.0.1");
        await new Promise((resolve) => server.once("listening", resolve));
        const controller = new AbortController();
        try {
            const res = await fetch(`http://127.0.0.1:${server.address().port}/v1/events?ticket=${ticket}`, {signal: controller.signal});
            const reader = res.body.getReader();
            const {value} = await reader.read();

            assert.match(res.headers.get("content-type"), /^text\/event-stream/);
            assert.match(Buffer.from(value).toString(), new RegExp(`event: ready\\ndata: \\{"userId":${admin.user.id}\\}`));
        } finally {
            controller.abort();
            server.closeAllConnections();
            await new Promise((resolve) => server.close(resolve));
        }
    });

    it("refuses a login token as a ticket", async () => {
        const res = await api.get(`/events?ticket=${admin.token}`);

        assert.deepEqual([res.status, res.body.code], [401, "EVENTS_TICKET_INVALID"]);
    });
});
