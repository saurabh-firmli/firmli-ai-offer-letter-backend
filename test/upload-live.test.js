import {after, describe, it} from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import express from "express";
import request from "supertest";

import uploadFile, {uploadLogo} from "../src/v1/middlewares/upload.middleware.js";
import customErrorMiddleware from "../src/v1/middlewares/customError.middleware.js";
import realtimeHelper from "../src/v1/helpers/realtime.helper.js";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const PDF = Buffer.from("%PDF-1.4\n%test\n");
// A one-file ZIP (a DOCX is a ZIP), deflated; claimedSize lets a test fake the size the ZIP says it unpacks to
const zip = (data, claimedSize = data.length) => {
    const name = Buffer.from("word/document.xml");
    const packed = zlib.deflateRawSync(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(claimedSize, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(claimedSize, 24);
    central.writeUInt16LE(name.length, 28);
    const body = Buffer.concat([local, name, packed]);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(central.length + name.length, 12);
    end.writeUInt32LE(body.length, 16);
    return Buffer.concat([body, central, name, end]);
};
const DOCX = zip(Buffer.from("<w:document>Transcript</w:document>"));
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("uploads", () => {
    const app = express();
    const answer = (req, res) => res.json({name: req.file.originalname, size: req.file.size, documentTypeId: req.body.documentTypeId});
    app.post("/logo", uploadLogo, answer);
    app.post("/document", uploadFile, answer);
    app.use(customErrorMiddleware);
    const send = (path, buffer, name, type, field = "file") => request(app).post(path).attach(field, buffer, {filename: name, contentType: type});

    it("takes a PNG or JPG logo, whatever the case of its extension", async () => {
        assert.equal((await send("/logo", PNG, "Logo.PNG", "image/png")).status, 200);
        assert.equal((await send("/logo", JPG, "logo.jpeg", "image/jpeg")).status, 200);
    });

    it("refuses a PDF or DOCX as a logo", async () => {
        for (const [buffer, name, type] of [[PDF, "logo.pdf", "application/pdf"], [DOCX, "logo.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]]) {
            const res = await send("/logo", buffer, name, type);
            assert.deepEqual([res.status, res.body.errors], [422, {file: "Upload a PNG or JPG image"}], name);
        }
    });

    it("refuses a file whose content is not what its name says", async () => {
        assert.deepEqual((await send("/logo", PDF, "logo.png", "image/png")).body.errors, {file: "Upload a PNG or JPG image"});
        assert.deepEqual((await send("/document", PNG, "transcript.pdf", "application/pdf")).body.errors, {file: "Upload a PDF, DOCX, JPG or PNG file"});
    });

    it("refuses a name and type that do not belong together, and other kinds of files", async () => {
        assert.equal((await send("/document", PDF, "transcript.pdf", "image/png")).status, 422);
        assert.equal((await send("/document", Buffer.from("MZ"), "setup.exe", "application/octet-stream")).status, 422);
        assert.equal((await send("/document", Buffer.from("x"), "notes", "text/plain")).status, 422);
    });

    it("keeps a logo to 2 MB and a document to 10 MB", async () => {
        const bigLogo = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
        const bigDocument = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]);

        assert.deepEqual((await send("/logo", bigLogo, "logo.png", "image/png")).body.errors, {file: "The file must be at most 2 MB"});
        assert.deepEqual((await send("/document", bigDocument, "big.pdf", "application/pdf")).body.errors, {file: "The file must be at most 10 MB"});
        assert.equal((await send("/document", Buffer.concat([PDF, Buffer.alloc(3 * 1024 * 1024)]), "ok.pdf", "application/pdf")).status, 200);
    });

    it("asks for a file when none came, or it came under another field name", async () => {
        assert.deepEqual((await request(app).post("/logo").field("x", "1")).body.errors, {file: "Choose a file to upload"});
        assert.equal((await send("/logo", PNG, "logo.png", "image/png", "image")).status, 422);
    });

    it("refuses a DOCX that would unpack into far more than it is (a zip bomb), even one that fakes its size", async () => {
        const bomb = zip(Buffer.alloc(100 * 1024 * 1024));
        const lyingBomb = zip(Buffer.alloc(100 * 1024 * 1024), 1000);
        const damaged = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64)]);

        assert.ok(bomb.length < 200 * 1024);
        for (const buffer of [bomb, lyingBomb, damaged]) {
            assert.deepEqual((await send("/document", buffer, "cv.docx", DOCX_TYPE)).body.errors, {file: "This DOCX file is damaged, or too large once unpacked"});
        }
        assert.equal((await send("/document", zip(Buffer.alloc(5 * 1024 * 1024, "a")), "big-but-fine.docx", DOCX_TYPE)).status, 200);
    });

    it("takes one file only", async () => {
        const res = await request(app).post("/document").attach("file", PDF, {filename: "a.pdf", contentType: "application/pdf"}).attach("file", PDF, {filename: "b.pdf", contentType: "application/pdf"});

        assert.equal(res.status, 422);
    });

    it("keeps other form fields and names with non-English characters", async () => {
        const res = await request(app).post("/document").field("documentTypeId", "2").attach("file", DOCX, {filename: "Zeugnis_Müller_成绩.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"});

        assert.deepEqual(res.body, {name: "Zeugnis_Müller_成绩.docx", size: DOCX.length, documentTypeId: "2"});
    });
});

describe("live updates: who receives what", () => {
    // A fake open stream: what was written to it
    const stream = (user) => {
        const written = [];
        let onClose = () => {};
        const req = {on: (event, callback) => event === "close" && (onClose = callback)};
        const res = {writeHead: () => {}, write: (chunk) => written.push(chunk), end: () => written.push("<end>")};
        realtimeHelper.open(req, res, user);
        return {written, close: () => onClose(), events: () => written.map((chunk) => chunk.match(/^event: (.+)$/m)?.[1]).filter(Boolean)};
    };
    const reader = (tenantId, modules) => ({id: tenantId * 100, tenantId, permissions: Object.fromEntries(modules.map((module) => [module, {read: true}]))});
    const streams = [];
    after(() => streams.forEach((open) => open.close()));

    it("starts every stream with ready and a retry time", () => {
        const open = stream(reader(1, ["applications"]));
        streams.push(open);

        assert.match(open.written[0], /^retry: 5000\nevent: ready\ndata: \{"userId":100\}\n\n$/);
    });

    it("sends an event only to the same tenant and only with read on its module", () => {
        const admin = stream(reader(1, ["applications", "letters"]));
        const reviewer = stream(reader(1, ["applications"]));
        const otherTenant = stream(reader(2, ["applications", "letters"]));
        streams.push(admin, reviewer, otherTenant);

        realtimeHelper.publish(1, "assessment.updated", {applicationId: 5, status: "completed"});
        realtimeHelper.publish(1, "letter.updated", {applicationId: 5, letterId: 9, status: "pending_approval"});

        assert.deepEqual(admin.events(), ["ready", "assessment.updated", "letter.updated"]);
        assert.deepEqual(reviewer.events(), ["ready", "assessment.updated"]);
        assert.deepEqual(otherTenant.events(), ["ready"]);
    });

    it("writes the data as one JSON line", () => {
        const open = stream(reader(3, ["communications"]));
        streams.push(open);
        realtimeHelper.publish(3, "email.updated", {applicationId: 1, emailId: 2, status: "sent", note: "line\nbreak"});

        assert.equal(open.written.at(-1), 'event: email.updated\ndata: {"applicationId":1,"emailId":2,"status":"sent","note":"line\\nbreak"}\n\n');
    });

    it("stops sending to a stream once the browser has closed it", () => {
        const open = stream(reader(4, ["applications"]));
        open.close();
        realtimeHelper.publish(4, "assessment.updated", {applicationId: 1, status: "failed"});

        assert.deepEqual(open.events(), ["ready"]);
    });
});
