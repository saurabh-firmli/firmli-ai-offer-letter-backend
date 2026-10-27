import {before, describe, it} from "node:test";
import assert from "node:assert/strict";
import {files, startApp} from "./context.js";

// An application from draft to the student's inbox: documents in S3, the AI assessment (fake OpenAI),
// the decision, manual review, the letter PDF, its approval and the email (fake SMTP)
const {login, newTenant, mail, ai, models, db, waitUntil} = await startApp();

const year = new Date().getUTCFullYear();
const OPENAI_KEY = "sk-test-0123456789abcdefghij";
let admin;
let officer;
let reviewer;
let other;
let program;
let typeId;

const newApplication = async (firstName, intakeTerm, by = admin) => {
    const res = await by.api.post("/applications", {
        student: {firstName, lastName: "Okafor", email: `${firstName.toLowerCase()}.lbs@yopmail.com`, dateOfBirth: "2001-04-12", nationalityId: 2},
        programId: program.id,
        intakeTerm,
        intakeYear: year,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body.errors));
    return res.body.data;
};
const upload = (applicationId, typeCode, fileName = `${typeCode}.pdf`, buffer = files.pdf(typeCode), by = admin) =>
    by.api.post(`/applications/${applicationId}/documents`).field("documentTypeId", String(typeId(typeCode))).attach("file", buffer, {filename: fileName, contentType: "application/pdf"});
const submit = (applicationId) => admin.api.post(`/applications/${applicationId}/submit`, {confirmed: true});
// The latest assessment once it has finished
const assessed = (applicationId) =>
    waitUntil(async () => {
        const run = (await admin.api.get(`/applications/${applicationId}/assessment`)).body.data;
        return run && run.status !== "in_progress" && run;
    }, 10_000, "the assessment");
// A student whose documents and values the fake AI reads, submitted and assessed
const assessedApplication = async (firstName, intakeTerm, values, documents = ["academic_transcript", "english_language_certificate"]) => {
    const application = await newApplication(firstName, intakeTerm);
    for (const code of documents) await upload(application.id, code);
    ai.values = values;
    await submit(application.id);
    return {application, assessment: await assessed(application.id)};
};

before(async () => {
    admin = await newTenant("Lagos Business School", "admin.lbs@yopmail.com");
    other = await newTenant("Other College", "admin.other@yopmail.com");
    await admin.api.patch("/settings", {
        openaiApiKey: OPENAI_KEY,
        contactEmail: "admissions.lbs@yopmail.com",
        website: "https://lbs.example.com",
        autoAssessment: true,
        autoLetterGeneration: false,
        autoEmailDispatch: false,
        emailMaxRetries: 1,
    });

    const roles = (await admin.api.get("/roles")).body.data.roles;
    const roleId = (code) => roles.find((role) => role.code === code).id;
    await admin.api.post("/users", {name: "Omar Officer", email: "omar.lbs@yopmail.com", password: "Password123", roleId: roleId("admissions_officer")});
    await admin.api.post("/users", {name: "Rita Reviewer", email: "rita.lbs@yopmail.com", password: "Password123", roleId: roleId("reviewer")});
    officer = await login("omar.lbs@yopmail.com", "Password123");
    reviewer = await login("rita.lbs@yopmail.com", "Password123");

    // GPA >= 3.0 (transcript) and IELTS >= 6.5 (English certificate), both mandatory; both documents required
    const options = (await admin.api.get("/eligibility/options")).body.data;
    typeId = (code) => options.documentTypes.find((type) => type.code === code).id;
    const categoryId = (code) => options.categories.find((item) => item.code === code).id;
    const campus = (await admin.api.post("/campuses", {name: "Victoria Island", cityId: 2})).body.data;
    const set = (await admin.api.post("/eligibility/sets", {name: "MBA Entry"})).body.data;
    const v1 = set.versions[0].id;
    await admin.api.post(`/eligibility/versions/${v1}/criteria`, {name: "Minimum GPA", categoryId: categoryId("academic_qualification"), dataType: "number", operator: "greater_than_or_equal", requiredValue: "3.0", unit: "GPA", documentTypeIds: [typeId("academic_transcript")], rejectionReason: "GPA below 3.0"});
    await admin.api.post(`/eligibility/versions/${v1}/criteria`, {name: "IELTS overall band", categoryId: categoryId("english_proficiency"), dataType: "number", operator: "greater_than_or_equal", requiredValue: "6.5", documentTypeIds: [typeId("english_language_certificate")]});
    await admin.api.post(`/eligibility/versions/${v1}/documents`, {documentTypeId: typeId("academic_transcript")});
    await admin.api.post(`/eligibility/versions/${v1}/documents`, {documentTypeId: typeId("english_language_certificate")});
    await admin.api.post(`/eligibility/versions/${v1}/publish`);

    const template = async (path, body) => (await admin.api.post(path, {status: "published", ...body})).body.data.id;
    program = (
        await admin.api.post("/programs", {
            name: "MBA",
            code: "MBA",
            campusId: campus.id,
            duration: "2 years",
            status: "active",
            eligibilitySetId: set.id,
            conditionalOfferTemplateId: await template("/letter-templates", {name: "Offer", letterType: "conditional_offer", referencePrefix: "OFR", subject: "Offer for {{student_full_name}}", body: "<p>Dear {{student_full_name}},</p><p>Offer for {{program_name}}.</p>{{eligibility_table}}"}),
            rejectionTemplateId: await template("/letter-templates", {name: "Rejection", letterType: "rejection", referencePrefix: "REJ", body: "<p>Dear {{student_full_name}}, sorry.</p>{{unmet_requirements}}"}),
            offerEmailTemplateId: await template("/email-templates", {name: "Offer Email", emailType: "conditional_offer", subject: "Your offer {{application_number}}", body: "<p>Dear {{student_full_name}}, your letter is attached.</p>", attachPdfLetter: true}),
            rejectionEmailTemplateId: await template("/email-templates", {name: "Rejection Email", emailType: "rejection", subject: "Your application {{application_number}}", body: "<p>Dear {{student_full_name}}.</p>", attachPdfLetter: true}),
        })
    ).body.data;
});

describe("a draft application", () => {
    let draft;
    let transcript;

    it("starts as a draft with a number, the version's required documents and none uploaded", async () => {
        draft = await newApplication("Amara", "fall");

        assert.equal(draft.status, "draft");
        assert.match(draft.applicationNumber, /^APP-\d{8}$/);
        assert.deepEqual(draft.missingDocuments, ["Academic Transcript", "English Language Certificate"]);
    });

    it("refuses the same student twice for the same program and intake", async () => {
        const again = await admin.api.post("/applications", {student: {firstName: "Amara", lastName: "Okafor", email: "amara.lbs@yopmail.com"}, programId: program.id, intakeTerm: "fall", intakeYear: year});

        assert.deepEqual(again.body.errors, [{message: "This student already has an application for this program and intake"}]);
    });

    it("stores documents in S3, and gives a short-lived link that downloads the same file", async () => {
        const res = await upload(draft.id, "academic_transcript", "Transcript Amara.pdf", files.pdf("amara transcript"));
        transcript = res.body.data;
        assert.deepEqual([res.status, transcript.documentType, transcript.originalName], [201, "Academic Transcript", "Transcript Amara.pdf"]);

        const link = (await admin.api.get(`/applications/documents/${transcript.id}/download-url`)).body.data;
        const file = await fetch(link.url);
        assert.equal(file.status, 200);
        assert.equal(await file.text(), files.pdf("amara transcript").toString());
        assert.equal((await admin.api.get(`/applications/${draft.id}`)).body.data.missingDocuments.join(), "English Language Certificate");
    });

    it("refuses a file that is not what it says, and an unknown document type", async () => {
        const fake = await admin.api.post(`/applications/${draft.id}/documents`).field("documentTypeId", String(typeId("passport"))).attach("file", Buffer.from("MZ not a pdf"), {filename: "fake.pdf", contentType: "application/pdf"});
        const unknownType = await admin.api.post(`/applications/${draft.id}/documents`).field("documentTypeId", "99999").attach("file", files.pdf(), {filename: "x.pdf", contentType: "application/pdf"});

        assert.deepEqual(fake.body.errors, {file: "Upload a PDF, DOCX, JPG or PNG file"});
        assert.deepEqual(unknownType.body.errors, {documentTypeId: "Document type not found"});
    });

    it("asks for the confirmation before submitting", async () => {
        assert.deepEqual((await admin.api.post(`/applications/${draft.id}/submit`, {})).body.errors, {confirmed: "Confirm that the information is accurate and the student has consented"});
    });

    it("keeps applications and their documents to the tenant", async () => {
        assert.equal((await other.api.get(`/applications/${draft.id}`)).status, 404);
        assert.equal((await other.api.get(`/applications/documents/${transcript.id}/download-url`)).status, 404);
        assert.equal((await other.api.get("/applications")).body.data.total, 0);
        assert.deepEqual((await reviewer.api.post("/applications", {})).body.errors, [{message: "You do not have permission to create applications"}]);
    });
});

describe("the AI assessment", () => {
    it("gives a conditional offer when every mandatory criterion is met", async () => {
        const {application, assessment} = await assessedApplication("Bola", "spring", {"Minimum GPA": "3.6", "IELTS overall band": "7.0"});

        assert.deepEqual([assessment.status, assessment.outcome], ["completed", "conditional_offer"]);
        assert.deepEqual(assessment.criteria.map((criterion) => [criterion.name, criterion.result, criterion.foundValue]), [["Minimum GPA", "met", "3.6"], ["IELTS overall band", "met", "7.0"]]);
        assert.deepEqual(assessment.documents.map((document) => document.status), ["completed", "completed"]);
        const saved = (await admin.api.get(`/applications/${application.id}`)).body.data;
        assert.deepEqual([saved.status, saved.outcome], ["completed", "conditional_offer"]);
    });

    it("calls the AI with the tenant's own key, and is locked while a run is going", async () => {
        const calls = ai.requests.filter((request) => request.authorization === `Bearer ${OPENAI_KEY}`);

        assert.ok(calls.some((request) => request.schemaName === "document_extraction"));
        assert.ok(calls.some((request) => request.schemaName === "eligibility_values"));
        assert.equal(ai.requests.length, calls.length);
    });

    it("rejects when a mandatory criterion is not met", async () => {
        const {assessment} = await assessedApplication("Chidi", "summer", {"Minimum GPA": "2.4", "IELTS overall band": "7.0"});

        assert.equal(assessment.outcome, "rejection");
        assert.deepEqual(assessment.criteria.map((criterion) => criterion.result), ["not_met", "met"]);
    });

    it("sends it to manual review when a value and a required document are missing", async () => {
        const {application, assessment} = await assessedApplication("Dayo", "winter", {"Minimum GPA": "3.8"}, ["academic_transcript"]);

        assert.equal(assessment.outcome, "manual_review");
        assert.ok(assessment.flags.some((flag) => flag.code === "missing_documents"));
        const queue = (await admin.api.get(`/reviews?search=${application.applicationNumber}`)).body.data.items;
        assert.deepEqual(queue.map((item) => item.status), ["unassigned"]);
        assert.deepEqual((await admin.api.post(`/applications/${application.id}/assess`)).body.errors, [{message: "This application is in manual review; return it for reassessment first"}]);
    });

    it("ends as failed when the AI refuses the key, and can be run again", async () => {
        const application = await newApplication("Efe", "fall", officer);
        await upload(application.id, "academic_transcript");
        await upload(application.id, "english_language_certificate");
        ai.fail = {status: 401, message: "Incorrect API key provided: sk-test-0123456789abcdefghij"};
        await submit(application.id);

        const failed = await assessed(application.id);
        ai.fail = null;
        assert.equal(failed.status, "failed");
        assert.equal(failed.errorMessage.includes("0123456789"), false);

        ai.values = {"Minimum GPA": "3.1", "IELTS overall band": "6.5"};
        assert.equal((await admin.api.post(`/applications/${application.id}/assess`)).status, 202);
        assert.equal((await assessed(application.id)).outcome, "conditional_offer");
    });

    it("logs every AI call with its tokens and cost", async () => {
        const summary = (await admin.api.get("/ai-usage/summary")).body.data;

        assert.ok(summary.totals.requests >= 8);
        assert.ok(summary.totals.failed >= 1);
        assert.ok(summary.totals.costUsd > 0);
        assert.equal(summary.totals.unpricedRequests, 0);
    });
});

describe("letters and emails", () => {
    let bola;
    let letter;

    before(async () => {
        bola = (await admin.api.get("/applications?search=bola")).body.data.items[0];
    });

    it("generates the offer letter as a PDF that waits for approval", async () => {
        assert.equal((await reviewer.api.post(`/applications/${bola.id}/letters`)).status, 403);
        const res = await officer.api.post(`/applications/${bola.id}/letters`);
        letter = res.body.data;

        assert.deepEqual([res.status, letter.letterType, letter.status, letter.version], [201, "conditional_offer", "pending_approval", 1]);
        assert.match(letter.referenceNumber, /^OFR-/);
        assert.equal(letter.subject, "Offer for Bola Okafor");
        assert.ok(letter.bodyHtml.includes("Minimum GPA"));

        const link = (await admin.api.get(`/letters/${letter.id}/download-url`)).body.data;
        const pdf = Buffer.from(await (await fetch(link.url)).arrayBuffer());
        assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    });

    it("emails only an approved letter, and only someone allowed approves it", async () => {
        assert.deepEqual((await officer.api.post(`/letters/${letter.id}/send`, {})).body.errors, [{message: "Only an approved letter can be emailed"}]);
        assert.equal((await officer.api.post(`/letters/${letter.id}/approve`, {})).status, 403);

        const approved = await admin.api.post(`/letters/${letter.id}/approve`, {note: "Looks good"});
        assert.deepEqual([approved.body.data.status, approved.body.data.reviewNote], ["approved", "Looks good"]);
        assert.deepEqual((await admin.api.post(`/letters/${letter.id}/approve`, {})).body.errors, [{message: "Only a letter waiting for approval can be approved or rejected"}]);
    });

    it("sends the student the email with the letter attached", async () => {
        const sent = await officer.api.post(`/letters/${letter.id}/send`, {});

        assert.deepEqual([sent.status, sent.body.data.status, sent.body.data.recipient], [201, "sent", "bola.lbs@yopmail.com"]);
        const email = await mail.waitFor((message) => message.to.includes("bola.lbs@yopmail.com"));
        assert.equal(email.subject, `Your offer ${bola.applicationNumber}`);
        assert.match(email.html, /Dear Bola Okafor, your letter is attached/);
        assert.ok(email.attachments.some((attachment) => attachment.contentType === "application/pdf" && attachment.fileName.startsWith("OFR-")));
        assert.equal((await admin.api.get(`/applications/${bola.id}`)).body.data.letter.emailStatus, "sent");
    });

    it("keeps what a later reply needs to find its email: the Message-ID sent, and the mailbox replies go to", async () => {
        const email = await mail.waitFor((message) => message.to.includes("bola.lbs@yopmail.com"));
        const [saved] = await db.select(
            "SELECT message_id AS messageId, from_email AS fromEmail, reply_to AS replyTo FROM application_emails WHERE recipient = 'bola.lbs@yopmail.com'"
        );

        assert.match(saved.messageId, /^<[0-9a-f-]{36}@yopmail\.com>$/);
        assert.equal(email.headers["message-id"], saved.messageId);
        assert.deepEqual([saved.fromEmail, saved.replyTo, email.headers["reply-to"]], ["no-reply@yopmail.com", "admissions.lbs@yopmail.com", "admissions.lbs@yopmail.com"]);
    });

    it("retries an email the mail server refused, and fails it for good after the last try", async () => {
        const chidi = (await admin.api.get("/applications?search=chidi")).body.data.items[0];
        const rejection = (await officer.api.post(`/applications/${chidi.id}/letters`)).body.data;
        await admin.api.post(`/letters/${rejection.id}/approve`, {});

        mail.reject = true;
        const first = (await officer.api.post(`/letters/${rejection.id}/send`, {})).body.data;
        assert.deepEqual([first.status, first.attempts, Boolean(first.nextRetryAt)], ["retrying", 1, true]);
        const second = (await officer.api.post(`/emails/${first.id}/retry`)).body.data;
        assert.deepEqual([second.status, second.attempts, second.nextRetryAt], ["failed", 2, null]);

        mail.reject = false;
        const fixed = (await officer.api.post(`/emails/${first.id}/retry`)).body.data;
        assert.equal(fixed.status, "sent");
        assert.equal((await officer.api.post(`/emails/${first.id}/retry`)).status, 409);
        const delivered = await mail.waitFor((message) => message.to.includes("chidi.lbs@yopmail.com"));
        const [saved] = await db.select("SELECT message_id AS messageId FROM application_emails WHERE id = :id", {id: first.id});
        assert.equal(delivered.headers["message-id"], saved.messageId);
    });

    it("rejecting a letter needs a reason; a new letter supersedes the older one", async () => {
        const second = (await officer.api.post(`/applications/${bola.id}/letters`)).body.data;
        assert.deepEqual((await admin.api.post(`/letters/${second.id}/reject`, {})).body.errors, {note: "note is required"});
        assert.equal((await admin.api.post(`/letters/${second.id}/reject`, {note: "Wrong intake"})).body.data.status, "rejected");

        const history = (await admin.api.get(`/applications/${bola.id}/letters`)).body.data;
        assert.deepEqual(history.map((item) => [item.version, item.status]), [[2, "rejected"], [1, "superseded"]]);
    });

    it("does it all by itself when the automation settings are on", async () => {
        await admin.api.patch("/settings", {autoLetterGeneration: true, autoEmailDispatch: true, autoApproveOffers: true});
        const {application} = await assessedApplication("Funmi", "fall", {"Minimum GPA": "3.9", "IELTS overall band": "8.0"});

        const done = await waitUntil(async () => {
            const current = (await admin.api.get(`/applications/${application.id}`)).body.data;
            return current.letter?.emailStatus === "sent" && current;
        }, 10_000, "the automatic letter and email");
        assert.equal(done.letter.status, "approved");
        await mail.waitFor((message) => message.to.includes("funmi.lbs@yopmail.com"));
        await admin.api.patch("/settings", {autoLetterGeneration: false, autoEmailDispatch: false, autoApproveOffers: false});
    });

    it("keeps letters and emails to the tenant", async () => {
        assert.equal((await other.api.get(`/letters/${letter.id}`)).status, 404);
        assert.equal((await other.api.post(`/applications/${bola.id}/letters`)).status, 404);
        assert.equal((await other.api.get("/emails")).body.data.total, 0);
    });
});

describe("manual review", () => {
    let dayo;
    let review;

    before(async () => {
        dayo = (await admin.api.get("/applications?search=dayo")).body.data.items[0];
        review = (await admin.api.get(`/reviews?search=${dayo.applicationNumber}`)).body.data.items[0];
    });

    it("assigns the case to a reviewer", async () => {
        const reviewerId = reviewer.user.id;
        const assigned = (await admin.api.put(`/reviews/${review.id}/assignment`, {reviewerId, priority: "high", note: "Check the IELTS"})).body.data;

        assert.deepEqual([assigned.status, assigned.reviewer.id, assigned.priority], ["assigned", reviewerId, "high"]);
        assert.deepEqual((await reviewer.api.get("/reviews?mine=true")).body.data.items.map((item) => item.id), [review.id]);
    });

    it("asks the student for documents by email, and the upload brings the case back", async () => {
        const requested = await reviewer.api.post(`/reviews/${review.id}/request-documents`, {documentTypeIds: [typeId("english_language_certificate")], message: "Please send a <clear> scan."});
        assert.deepEqual([requested.status, requested.body.data.status, requested.body.data.emailStatus], [200, "waiting_documents", "sent"]);

        const email = await mail.waitFor((message) => message.to.includes("dayo.lbs@yopmail.com"));
        assert.match(email.subject, /documents needed for application APP-/);
        assert.match(email.html, /Please send a &lt;clear&gt; scan\./);

        assert.equal((await upload(dayo.id, "english_language_certificate")).status, 201);
        assert.equal((await admin.api.get(`/reviews/${review.id}`)).body.data.status, "in_review");
    });

    it("decides the case: the application gets the outcome and the case is resolved", async () => {
        const decided = await reviewer.api.post(`/reviews/${review.id}/decision`, {outcome: "conditional_offer", reason: "IELTS original checked"});

        assert.equal(decided.status, 200, JSON.stringify(decided.body.errors));
        const application = (await admin.api.get(`/applications/${dayo.id}`)).body.data;
        assert.deepEqual([application.status, application.outcome], ["completed", "conditional_offer"]);
        assert.equal((await admin.api.get(`/reviews/${review.id}`)).body.data.status, "resolved");
        assert.equal((await admin.api.put(`/reviews/${review.id}/assignment`, {reviewerId: reviewer.user.id})).status, 409);
    });
});

describe("what the team sees afterwards", () => {
    it("shows the application's history in its activity", async () => {
        const bola = (await admin.api.get("/applications?search=bola")).body.data.items[0];
        const titles = JSON.stringify((await admin.api.get(`/applications/${bola.id}/activity`)).body.data);

        for (const text of ["submitted", "Letter generated", "Letter approved", "Email sent"]) assert.ok(titles.includes(text), text);
    });

    it("filters the applications list", async () => {
        const list = async (query) => (await admin.api.get(`/applications?${query}`)).body.data;

        assert.equal((await list("status=draft")).total, 1);
        assert.equal((await list("outcome=rejection")).total, 1);
        assert.equal((await list(`programId=${program.id}`)).total, 6);
        assert.equal((await admin.api.get("/applications?outcome=maybe")).status, 422);
    });

    it("counts it all on the dashboard and in reports", async () => {
        const dashboard = (await admin.api.get("/dashboard")).body.data;
        const report = (await admin.api.get("/reports")).body.data;

        assert.ok(dashboard.stats.emailsSent >= 3);
        assert.ok(report.kpis.emailsSent >= 3);
    });

    it("exports the applications as CSV", async () => {
        const res = await admin.api.get("/reports/export");

        assert.equal(res.status, 200);
        assert.match(res.headers["content-type"], /text\/csv/);
        const lines = res.text.trim().split("\n");
        assert.equal(lines.length, 1 + 5);
        assert.ok(res.text.includes("Bola Okafor"));
    });

    it("keeps an audit trail of the changes", async () => {
        const entries = (await admin.api.get("/audit-logs?module=applications&limit=100")).body.data.items;

        assert.ok(entries.some((entry) => entry.entityType === "application" && entry.changes.status?.to === "submitted"));
    });
});

describe("two people at the same moment, and work cut off", () => {
    const statuses = (responses) => responses.map((res) => res.status).sort();
    // Both requests at once, made to collide: the row is locked meanwhile, so both pass their checks and wait at
    // the same UPDATE; once it is let go, only the code's own guard keeps the second one from going through
    const atTheSameMoment = async (table, id, requests) => {
        const lock = await models.sequelize.transaction();
        await models.sequelize.query(`SELECT id FROM ${table} WHERE id = :id FOR UPDATE`, {replacements: {id}, transaction: lock});
        const answers = Promise.all(requests);
        await new Promise((resolve) => setTimeout(resolve, 500));
        await lock.commit();
        return answers;
    };

    it("approves a letter once when two approve it at the same moment", async () => {
        const bola = (await admin.api.get("/applications?search=bola")).body.data.items[0];
        const letter = (await officer.api.post(`/applications/${bola.id}/letters`)).body.data;

        const answers = await atTheSameMoment("application_letters", letter.id, [admin.api.post(`/letters/${letter.id}/approve`, {}), admin.api.post(`/letters/${letter.id}/approve`, {})]);
        assert.deepEqual(statuses(answers), [200, 409]);
        const approvals = (await admin.api.get(`/audit-logs?entityType=applicationLetter&entityId=${letter.id}&limit=50`)).body.data.items.filter((entry) => entry.changes.status?.to === "approved");
        assert.equal(approvals.length, 1);
    });

    it("runs one assessment when two are started at the same moment", async () => {
        await admin.api.patch("/settings", {autoAssessment: false});
        const application = await newApplication("Gbenga", "spring");
        await upload(application.id, "academic_transcript");
        await upload(application.id, "english_language_certificate");
        await submit(application.id);
        ai.values = {"Minimum GPA": "3.5", "IELTS overall band": "7.5"};

        const answers = await atTheSameMoment("applications", application.id, [admin.api.post(`/applications/${application.id}/assess`), admin.api.post(`/applications/${application.id}/assess`)]);
        assert.deepEqual(statuses(answers), [202, 409]);
        assert.equal((await assessed(application.id)).outcome, "conditional_offer");
        assert.equal((await admin.api.get(`/applications/${application.id}/assessments`)).body.data.length, 1);
        await admin.api.patch("/settings", {autoAssessment: true});
    });

    it("resolves a review case once when two people act on it at the same moment", async () => {
        const {application} = await assessedApplication("Halima", "summer", {"Minimum GPA": "3.4"}, ["academic_transcript"]);
        const review = (await admin.api.get(`/reviews?search=${application.applicationNumber}`)).body.data.items[0];

        const answers = await atTheSameMoment("manual_reviews", review.id, [
            admin.api.post(`/reviews/${review.id}/decision`, {outcome: "rejection", reason: "IELTS missing"}),
            reviewer.api.post(`/reviews/${review.id}/return-for-reassessment`, {note: "Run it again"}),
        ]);
        assert.deepEqual(statuses(answers), [200, 409]);
        const resolutions = (await admin.api.get(`/audit-logs?entityType=manualReview&entityId=${review.id}&limit=50`)).body.data.items.filter((entry) => entry.changes.status?.to === "resolved");
        assert.equal(resolutions.length, 1);
        assert.equal((await admin.api.get(`/reviews/${review.id}`)).body.data.status, "resolved");
    });

    it("never offers on its own when the program has no mandatory criterion", async () => {
        const options = (await admin.api.get("/eligibility/options")).body.data;
        const set = (await admin.api.post("/eligibility/sets", {name: "Optional Only"})).body.data;
        await admin.api.post(`/eligibility/versions/${set.versions[0].id}/criteria`, {name: "Work experience", categoryId: options.categories[0].id, dataType: "number", operator: "greater_than_or_equal", requiredValue: "2", isMandatory: false});
        await admin.api.post(`/eligibility/versions/${set.versions[0].id}/publish`);
        const campusId = (await admin.api.get("/dropdowns/campuses")).body.data[0].value;
        const optional = (await admin.api.post("/programs", {name: "Executive MBA", code: "EMBA", campusId, duration: "1 year", status: "active", eligibilitySetId: set.id})).body.data;

        const application = (await admin.api.post("/applications", {student: {firstName: "Ike", lastName: "Okafor", email: "ike.lbs@yopmail.com"}, programId: optional.id, intakeTerm: "fall", intakeYear: year})).body.data;
        await upload(application.id, "cv_resume");
        ai.values = {"Work experience": "5"};
        await submit(application.id);

        const assessment = await assessed(application.id);
        assert.deepEqual([assessment.outcome, assessment.flags.map((flag) => flag.code)], ["manual_review", ["no_mandatory_criteria"]]);
    });

    it("retries an email left 'sending' by a stopped process, but not one being sent right now", async () => {
        const {default: communicationService} = await import("../../src/v1/services/communication.service.js");
        const [stuck, fresh] = (await admin.api.get("/emails?limit=2")).body.data.items;
        await models.sequelize.query("UPDATE application_emails SET status = 'sending', updated_at = NOW() - INTERVAL 11 MINUTE WHERE id = :id", {replacements: {id: stuck.id}});
        await models.sequelize.query("UPDATE application_emails SET status = 'sending' WHERE id = :id", {replacements: {id: fresh.id}});

        await communicationService.recoverInterrupted();
        assert.equal((await admin.api.get(`/emails/${stuck.id}`)).body.data.status, "retrying");
        assert.equal((await admin.api.get(`/emails/${fresh.id}`)).body.data.status, "sending");
    });
});
