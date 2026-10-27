import {describe, it} from "node:test";
import assert from "node:assert/strict";

import criteriaHelper from "../src/v1/helpers/criteria.helper.js";
import csvHelper from "../src/v1/helpers/csv.helper.js";
import dateHelper from "../src/v1/helpers/date.helper.js";
import dbHelper from "../src/v1/helpers/db.helper.js";
import auditHelper from "../src/v1/helpers/audit.helper.js";
import assessmentService from "../src/v1/services/assessment.service.js";
import aiUsageService from "../src/v1/services/aiUsage.service.js";
import letterService from "../src/v1/services/letter.service.js";
import settingsService from "../src/v1/services/settings.service.js";
import communicationService from "../src/v1/services/communication.service.js";

describe("criteria: values the AI may find", () => {
    const gpa = {dataType: "number", operator: "greater_than_or_equal", requiredValue: "3.0"};

    it("is unclear for a value with words or a scale around it", () => {
        assert.equal(criteriaHelper.evaluate(gpa, "3.62 / 4.00"), "unclear");
        assert.equal(criteriaHelper.evaluate(gpa, "about 3.5"), "unclear");
        assert.equal(criteriaHelper.evaluate(gpa, "   "), "unclear");
    });

    it("reads thousands separators and numbers sent as numbers", () => {
        assert.equal(criteriaHelper.evaluate({dataType: "number", operator: "greater_than", requiredValue: "10000"}, "12,500"), "met");
        assert.equal(criteriaHelper.evaluate(gpa, 3), "met");
        assert.equal(criteriaHelper.evaluate(gpa, 0), "not_met");
    });

    it("includes both ends of between", () => {
        const band = {dataType: "number", operator: "between", requiredValue: "6.5,9"};

        assert.equal(criteriaHelper.evaluate(band, "6.5"), "met");
        assert.equal(criteriaHelper.evaluate(band, "9"), "met");
        assert.equal(criteriaHelper.evaluate(band, "6.4"), "not_met");
        assert.equal(criteriaHelper.evaluate(band, "9.5"), "not_met");
    });

    it("is unclear when the rule itself cannot be read", () => {
        assert.equal(criteriaHelper.evaluate({dataType: "number", operator: "greater_than", requiredValue: "three"}, "4"), "unclear");
        assert.equal(criteriaHelper.evaluate({dataType: "date", operator: "less_than", requiredValue: "2026-01-01"}, "15/07/2025"), "unclear");
        assert.equal(criteriaHelper.evaluate({dataType: "boolean", operator: "equal_to", requiredValue: "true"}, "maybe"), "unclear");
    });

    it("compares text and lists without minding case or spaces", () => {
        assert.equal(criteriaHelper.evaluate({dataType: "text", operator: "one_of", requiredValue: "UK,Ireland"}, " ireland"), "met");
        assert.equal(criteriaHelper.evaluate({dataType: "text", operator: "not_equal_to", requiredValue: "Nigeria"}, "NIGERIA"), "not_met");
        assert.equal(criteriaHelper.evaluate({dataType: "text", operator: "contains", requiredValue: "Science"}, "BSc Computer SCIENCE"), "met");
        assert.equal(criteriaHelper.evaluate({dataType: "boolean", operator: "equal_to", requiredValue: "no"}, "False"), "met");
    });

    it("counts the first and last day of a criterion as in force", () => {
        const criterion = {effectiveDate: "2026-01-01", expiryDate: "2026-12-31"};

        assert.equal(criteriaHelper.isInForce(criterion, "2026-01-01"), true);
        assert.equal(criteriaHelper.isInForce(criterion, "2026-12-31"), true);
        assert.equal(criteriaHelper.isInForce(criterion, "2027-01-01"), false);
        assert.equal(criteriaHelper.isInForce({effectiveDate: null, expiryDate: null}, "1999-01-01"), true);
    });
});

describe("assessment decision", () => {
    const settings = {
        flagMissingDocuments: true,
        flagLowConfidence: true,
        requireManualReviewEdgeCases: true,
        offerThreshold: 0.85,
        rejectionThreshold: 0.9,
    };
    const run = (overrides = {}) => ({settings: {...settings, ...overrides.settings}, documents: [{documentTypeId: 1}], requirements: overrides.requirements ?? [], ...overrides.run});
    const read = (name = "transcript.pdf") => ({status: "completed", typeMatches: true, document: {originalName: name}});
    const result = (result, confidence = 0.95, isMandatory = true, name = "Minimum GPA") => ({criterion: {name, isMandatory}, result, confidence, foundValue: "3.6"});

    it("offers when every mandatory criterion is met", () => {
        const decision = assessmentService.decide(run(), [read()], [result("met"), result("met", 0.99, true, "IELTS")]);

        assert.deepEqual([decision.outcome, decision.confidence, decision.flags, decision.summary], ["conditional_offer", 0.95, [], "All 2 mandatory criteria met"]);
    });

    it("rejects when a mandatory criterion is not met, ignoring optional ones", () => {
        const decision = assessmentService.decide(run(), [read()], [result("not_met", 0.97), result("not_met", 0.99, false, "Work experience")]);

        assert.deepEqual([decision.outcome, decision.summary], ["rejection", "Not met: Minimum GPA (3.6)"]);
    });

    it("sends an unclear mandatory criterion to manual review (edge cases on), or rejects it (off)", () => {
        const edgeCasesOff = run({settings: {requireManualReviewEdgeCases: false}});
        const noValue = {...result("unclear", 0.95, true, "IELTS"), foundValue: null};

        assert.equal(assessmentService.decide(run(), [read()], [result("met"), result("unclear", 0.5, true, "IELTS")]).outcome, "manual_review");
        const rejected = assessmentService.decide(edgeCasesOff, [read()], [result("met"), noValue]);
        assert.deepEqual([rejected.outcome, rejected.summary], ["rejection", "Not met: IELTS (no value)"]);
    });

    it("flags a low-confidence rejection that rests on an unclear criterion too", () => {
        const decision = assessmentService.decide(run({settings: {requireManualReviewEdgeCases: false}}), [read()], [result("unclear", 0.5)]);

        assert.deepEqual([decision.outcome, decision.suggestedOutcome, decision.flags], ["manual_review", "rejection", ["low_confidence"]]);
    });

    it("never offers when no mandatory criterion was checked", () => {
        const onlyOptional = assessmentService.decide(run(), [read()], [result("met", 0.99, false, "Work experience")]);
        const none = assessmentService.decide(run(), [read()], []);

        for (const decision of [onlyOptional, none]) {
            assert.deepEqual([decision.outcome, decision.confidence, decision.flags], ["manual_review", 0, ["no_mandatory_criteria"]]);
        }
    });

    it("prefers manual review over a rejection when another criterion is still unclear", () => {
        assert.equal(assessmentService.decide(run(), [read()], [result("not_met"), result("unclear", 0.4, true, "IELTS")]).outcome, "manual_review");
    });

    it("flags a low-confidence offer or rejection for a person", () => {
        const offer = assessmentService.decide(run(), [read()], [result("met", 0.6)]);
        const rejection = assessmentService.decide(run(), [read()], [result("not_met", 0.8)]);

        assert.deepEqual([offer.outcome, offer.suggestedOutcome, offer.flags], ["manual_review", "conditional_offer", ["low_confidence"]]);
        assert.deepEqual([rejection.outcome, rejection.suggestedOutcome, rejection.flags], ["manual_review", "rejection", ["low_confidence"]]);
        assert.equal(assessmentService.decide(run({settings: {flagLowConfidence: false}}), [read()], [result("met", 0.6)]).outcome, "conditional_offer");
    });

    it("flags a missing required document, a wrong document and an unreadable one", () => {
        const requirements = [{documentTypeId: 2, isRequired: true, documentType: "English Language Certificate"}, {documentTypeId: 3, isRequired: false, documentType: "Passport"}];
        const missing = assessmentService.decide(run({requirements}), [read()], [result("met")]);
        const wrong = assessmentService.decide(run(), [{...read("passport.pdf"), typeMatches: false, detectedType: "Passport"}], [result("met")]);
        const unreadable = assessmentService.decide(run(), [{status: "failed", document: {originalName: "scan.pdf"}}], [result("met")]);

        assert.deepEqual([missing.outcome, missing.flags], ["manual_review", ["missing_documents"]]);
        assert.match(missing.reasons[0], /English Language Certificate/);
        assert.doesNotMatch(missing.reasons[0], /Passport/);
        assert.deepEqual([wrong.flags, unreadable.flags], [["document_mismatch"], ["unreadable_document"]]);
        assert.equal(assessmentService.decide(run({requirements, settings: {flagMissingDocuments: false}}), [read()], [result("met")]).outcome, "conditional_offer");
    });

    it("lists each flag once and every reason", () => {
        const decision = assessmentService.decide(run(), [{status: "failed", document: {originalName: "a.pdf"}}, {status: "unsupported", document: {originalName: "b.docx"}}], [result("met")]);

        assert.deepEqual(decision.flags, ["unreadable_document"]);
        assert.match(decision.summary, /a\.pdf, b\.docx/);
    });

    it("treats a missing confidence as 0", () => {
        assert.equal(assessmentService.decide(run(), [read()], [result("met", null)]).confidence, 0);
    });

    it("suggests the outcome the criteria give once a reviewer overrides one", () => {
        const criteria = (finalResults) => finalResults.map((finalResult, index) => ({isMandatory: index < 2, finalResult}));

        assert.equal(assessmentService.criteriaOutcome(criteria(["met", "met", "not_met"])), "conditional_offer");
        assert.equal(assessmentService.criteriaOutcome(criteria(["met", "not_met"])), "rejection");
        assert.equal(assessmentService.criteriaOutcome(criteria(["met", "unclear"])), "manual_review");
        assert.equal(assessmentService.criteriaOutcome([]), "conditional_offer");
    });
});

describe("AI cost", () => {
    const prices = {input: 2, cachedInput: 0.2, output: 12};

    it("prices cached input tokens at the cached price", () => {
        assert.equal(aiUsageService.costOf(prices, {inputTokens: 1_000_000, cachedInputTokens: 400_000, outputTokens: 100_000}), 1.2 + 0.08 + 1.2);
    });

    it("uses the normal input price when there is no cached price", () => {
        assert.equal(aiUsageService.costOf({input: 2, cachedInput: null, output: 12}, {inputTokens: 1_000_000, cachedInputTokens: 1_000_000, outputTokens: 0}), 2);
    });

    it("has no cost while a price is missing, and 0 for no tokens", () => {
        assert.equal(aiUsageService.costOf({input: null, output: 12}, {inputTokens: 10, cachedInputTokens: 0, outputTokens: 10}), null);
        assert.equal(aiUsageService.costOf(prices, {inputTokens: 0, cachedInputTokens: 0, outputTokens: 0}), 0);
    });

    it("rounds to 6 decimals (a millionth of a dollar)", () => {
        assert.equal(aiUsageService.costOf({input: 0.2, cachedInput: 0.02, output: 1.2}, {inputTokens: 1, cachedInputTokens: 0, outputTokens: 1}), 0.000001);
        assert.equal(aiUsageService.money(null), null);
        assert.equal(aiUsageService.money(0.1234567), 0.123457);
    });
});

describe("letters: which letter and its checklist", () => {
    it("picks the letter from the application's state", () => {
        assert.equal(letterService.letterTypeOf({status: "manual_review"}), "manual_review");
        assert.equal(letterService.letterTypeOf({status: "completed", outcome: "rejection"}), "rejection");
        for (const application of [{status: "draft"}, {status: "submitted"}, {status: "processing"}, {status: "completed", outcome: null}]) {
            assert.throws(() => letterService.letterTypeOf(application), (error) => error.statusCode === 409, JSON.stringify(application));
        }
    });

    it("shows each required document as missing, received, verified or not of its type", () => {
        const requirements = [
            {documentTypeId: 1, documentType: "Transcript", isRequired: true},
            {documentTypeId: 2, documentType: "IELTS", customLabel: "English test", isRequired: true},
            {documentTypeId: 3, documentType: "Passport", isRequired: true},
            {documentTypeId: 4, documentType: "CV", isRequired: false},
            {documentTypeId: 5, documentType: "Degree", isRequired: true},
        ];
        const documents = [{id: 10, documentTypeId: 1, originalName: "t.pdf"}, {id: 11, documentTypeId: 2, originalName: "i.pdf"}, {id: 12, documentTypeId: 3, originalName: "p1.pdf"}, {id: 13, documentTypeId: 3, originalName: "p2.pdf"}];
        const readings = [{documentId: 10, status: "completed", typeMatches: true}, {documentId: 11, status: "completed", typeMatches: false}, {documentId: 12, status: "failed"}];
        const rows = letterService.documentChecklist(requirements, documents, readings);

        assert.deepEqual(rows.map((row) => [row.label, row.status, row.action]), [
            ["Transcript", "Verified", "None"],
            ["English test", "Does not match its type", "Please submit the correct document"],
            ["Passport", "Received", "None"],
            ["CV", "Missing", "None"],
            ["Degree", "Missing", "Please submit"],
        ]);
        assert.equal(rows[2].fileNames, "p1.pdf, p2.pdf");
    });

    it("tells the student each requirement, their result and what to do, never how it was checked", () => {
        const base = {name: "IELTS", operator: "greater_than_or_equal", requiredValue: "6.5", unit: "band", foundValue: "6.0"};
        const results = [{...base, finalResult: "not_met", override: null}, {...base, name: "GPA", finalResult: "met", override: {result: "met"}}, {...base, name: "Work", finalResult: "unclear", foundValue: null}];
        const offer = letterService.requirementsTable(results, () => "Below 6.5", "conditional_offer");

        assert.match(offer.html, /<th>Requirement<\/th><th>Required standard<\/th><th>Your result<\/th><th>Met<\/th><th>Your action<\/th>/);
        assert.match(offer.html, /<td>6\.0<\/td><td>No<\/td><td>Below 6\.5<\/td>/);
        assert.match(offer.html, /<td>Not shown in your documents<\/td><td>Not shown<\/td><td>Please send evidence of this<\/td>/);
        assert.equal(/AI|Reviewer/.test(offer.html), false);
        assert.deepEqual(letterService.requirementsTable([], () => ""), {text: "Not assessed yet", html: "<p>Not assessed yet</p>"});
    });

    it("asks nothing of the student in a rejection", () => {
        const table = letterService.requirementsTable([{name: "GPA", operator: "greater_than_or_equal", requiredValue: "3.5", finalResult: "not_met", foundValue: "2.4"}], () => "GPA below 3.5", "rejection");

        assert.equal(table.html.includes("Your action"), false);
        assert.match(table.html, /<td>2\.4<\/td><td>No<\/td><\/tr>/);
    });

    it("writes the required standard in words", () => {
        assert.equal(letterService.standardOf({operator: "between", requiredValue: "6.5,9", unit: "IELTS band"}), "Between 6.5 and 9 (IELTS band)");
        assert.equal(letterService.standardOf({operator: "one_of", requiredValue: "UK,Ireland"}), "One of: UK, Ireland");
        assert.equal(letterService.standardOf({operator: "greater_than_or_equal", requiredValue: "3.0", unit: "GPA"}), "Greater than or equal to 3.0 (GPA)");
    });

    it("never gives a rejection without a reason", () => {
        const reasonOf = () => "GPA below 3.5";
        const notMet = {name: "GPA", isMandatory: true, finalResult: "not_met"};
        const notShown = {name: "IELTS", isMandatory: true, finalResult: "unclear"};
        const optional = {name: "Work", isMandatory: false, finalResult: "not_met"};

        assert.equal(letterService.unmetRequirements({outcome: "rejection"}, [notMet, notShown, optional], reasonOf).text, "GPA: GPA below 3.5; IELTS: not shown in the documents you sent");
        assert.equal(letterService.unmetRequirements({outcome: "rejection", decisionReason: "Portfolio too weak"}, [], reasonOf).text, "Portfolio too weak");
        assert.equal(letterService.unmetRequirements({outcome: "rejection"}, [], reasonOf).text, "Your application does not meet the entry requirements of the program");
        assert.equal(letterService.unmetRequirements({outcome: "conditional_offer"}, [], reasonOf).text, "None");
    });

    it("counts a document sent with the wrong kind of file as still needed, unless a right file came too", () => {
        const requirements = [{documentTypeId: 1, documentType: "Transcript", isRequired: true}];
        const wrong = letterService.documentChecklist(requirements, [{id: 1, documentTypeId: 1, originalName: "passport.pdf"}], [{documentId: 1, status: "completed", typeMatches: false}]);
        const fixedLater = letterService.documentChecklist(
            requirements,
            [{id: 1, documentTypeId: 1, originalName: "passport.pdf"}, {id: 2, documentTypeId: 1, originalName: "transcript.pdf"}],
            [{documentId: 1, status: "completed", typeMatches: false}, {documentId: 2, status: "completed", typeMatches: true}]
        );

        assert.deepEqual([wrong[0].mismatch, wrong[0].status], [true, "Does not match its type"]);
        assert.deepEqual([fixedLater[0].mismatch, fixedLater[0].status], [false, "Verified"]);
    });

    it("escapes what an applicant typed inside the tables", () => {
        const rows = letterService.documentChecklist([{documentTypeId: 1, documentType: "Transcript", isRequired: true}], [{id: 1, documentTypeId: 1, originalName: "<script>x</script>.pdf"}], []);
        const values = letterService.render({body: "{{x}}"}, {x: {html: "safe"}});

        assert.equal(rows[0].fileNames, "<script>x</script>.pdf");
        assert.equal(values.bodyHtml, "<p>safe</p>");
    });
});

describe("helpers: lists, dates, CSV", () => {
    it("escapes LIKE wildcards in a search", () => {
        assert.equal(dbHelper.likePattern("50%_off"), "%50\\%\\_off%");
        assert.equal(dbHelper.likePattern("back\\slash"), "%back\\\\slash%");
    });

    it("counts every status, 0 for the missing ones", () => {
        assert.deepEqual(dbHelper.countsBy([{status: "sent", count: 4}], {sending: "Sending", sent: "Sent", failed: "Failed"}), {sending: 0, sent: 4, failed: 0});
        assert.deepEqual(dbHelper.countsBy([], {a: "A"}), {a: 0});
    });

    it("stores empty form fields as NULL, keeping 0 and false", () => {
        assert.deepEqual(dbHelper.emptyToNull({a: "", b: 0, c: false, d: "x", e: null}), {a: null, b: 0, c: false, d: "x", e: null});
    });

    it("adds days across months, years and leap days", () => {
        assert.equal(dateHelper.addDays("2024-02-28", 1), "2024-02-29");
        assert.equal(dateHelper.addDays("2026-12-31", 1), "2027-01-01");
        assert.equal(dateHelper.addDays("2026-03-01", -1), "2026-02-28");
        assert.equal(dateHelper.daysBetween("2026-01-01", "2026-12-31"), 364);
    });

    it("gives the viewer's day on the other side of UTC too", () => {
        assert.equal(dateHelper.localDate(new Date("2026-10-26T03:00:00Z"), -300), "2026-10-25");
        assert.equal(dateHelper.localDate(new Date("2026-10-25T23:00:00Z"), 330), "2026-10-26");
    });

    it("charts the last 30 days by default and at most 366 days", () => {
        const today = dateHelper.localDate(new Date(), 0);

        assert.deepEqual(dateHelper.chartRange({utcOffset: 0}, 30), {start: dateHelper.addDays(today, -29), end: today});
        assert.deepEqual(dateHelper.chartRange({from: "2026-01-01", to: "2026-12-31", utcOffset: 0}, 30), {start: "2026-01-01", end: "2026-12-31"});
        assert.throws(() => dateHelper.chartRange({from: "2025-01-01", to: "2026-01-02", utcOffset: 0}, 30), (error) => error.statusCode === 422);
    });

    it("filters on the bare column, so its index can be used", () => {
        assert.doesNotMatch(dateHelper.inPeriodSql("a.submitted_at"), /a\.submitted_at \+/);
        assert.match(dateHelper.inRangeSql("x.started_at", "chartFrom", "chartTo"), /^x\.started_at >= :chartFrom - INTERVAL :utcOffset MINUTE AND x\.started_at < :chartTo \+ INTERVAL 1 DAY - INTERVAL :utcOffset MINUTE$/);
    });

    it("streams the same CSV as building it at once", () => {
        const columns = [{header: "Name", value: (row) => row.name}, {header: "Score", value: (row) => row.score}];
        const rows = [{name: "A, B", score: 0}, {name: "-1+2", score: null}, {name: "\tTab", score: new Date("2026-01-01T00:00:00Z")}];

        assert.equal(csvHelper.header(columns) + csvHelper.rows(columns, rows), csvHelper.toCsv(columns, rows));
        assert.equal(csvHelper.rows(columns, rows), '"A, B",0\r\n\'-1+2,\r\n\'\tTab,2026-01-01T00:00:00.000Z\r\n');
        assert.equal(csvHelper.rows(columns, []), "");
    });
});

describe("audit changes", () => {
    const row = (current, previous = {}, changed = Object.keys(current)) => ({
        changed: () => changed,
        previous: (field) => previous[field],
        get: (field) => (field?.plain ? current : current[field]),
    });

    it("logs only fields that really changed on an update", () => {
        const changes = auditHelper.changesOf("update", row({status: "active", confidence: 0.5, updatedAt: new Date()}, {status: "draft", confidence: "0.50"}, ["status", "confidence", "updatedAt"]));

        assert.deepEqual(changes, {status: {from: "draft", to: "active"}});
    });

    it("hides passwords and skips bookkeeping and the model's own unlogged fields", () => {
        const changes = auditHelper.changesOf("create", row({id: 9, name: "Riya", passwordHash: "$2b$10$x", tokenVersion: 0, body: "long"}), ["body"]);

        assert.deepEqual(changes, {name: {from: null, to: "Riya"}, passwordHash: {from: null, to: "***"}});
    });

    it("keeps the old values on a delete and writes dates as ISO text", () => {
        const changes = auditHelper.changesOf("delete", row({name: "Old campus", openedAt: new Date("2026-01-01T00:00:00Z")}));

        assert.deepEqual(changes, {name: {from: "Old campus", to: null}, openedAt: {from: "2026-01-01T00:00:00.000Z", to: null}});
    });

    it("treats a DECIMAL read as text and sent as a number as the same value", () => {
        assert.equal(auditHelper.isSame("12.50", 12.5), true);
        assert.equal(auditHelper.isSame("0.85", 0.9), false);
        assert.equal(auditHelper.isSame(["a"], ["a"]), true);
    });

    it("still sees a change between two texts that look like numbers", () => {
        assert.equal(auditHelper.isSame("0123", "123"), false);
        assert.equal(auditHelper.isSame("", 0), false);
        assert.equal(auditHelper.isSame(null, 0), false);
    });
});

describe("settings and emails", () => {
    it("logs a settings save as only the fields that changed", () => {
        const current = {name: "Apex", autoAssessment: true, brandColor: null};

        assert.deepEqual(settingsService.changesOf(current, {name: "Apex", autoAssessment: false, brandColor: "#0F766E"}), {
            autoAssessment: {from: true, to: false},
            brandColor: {from: null, to: "#0F766E"},
        });
        assert.deepEqual(settingsService.changesOf(current, {name: "Apex"}), {});
    });

    it("hands an email without the inline logo to the browser unchanged", async () => {
        assert.equal(await communicationService.viewableHtml("<p>Hi</p>", 1), "<p>Hi</p>");
        assert.equal(await communicationService.viewableHtml(null, 1), null);
    });

    it("brands a student's email from the institution's details", () => {
        const brand = communicationService.brandOf({institutionName: "Apex", brandColor: null, logoStorageKey: "k.png", institutionAddress: "1 Road", institutionWebsite: null, institutionEmail: "a@yopmail.com", institutionPhone: null});

        assert.deepEqual(brand, {name: "Apex", color: null, hasLogo: true, address: "1 Road", website: null, email: "a@yopmail.com", phone: null});
    });
});

describe("phone numbers in letters and emails", () => {
    it("shows a saved E.164 number with the country code apart", async () => {
        const {default: phoneHelper} = await import("../src/v1/helpers/phone.helper.js");

        assert.deepEqual(
            ["+919876543210", "+23415550100", "+442079460958", "+14155550123", "+79161234567", "+97150123456"].map(phoneHelper.display),
            ["+91 9876543210", "+234 15550100", "+44 2079460958", "+1 4155550123", "+7 9161234567", "+971 50123456"]
        );
        assert.deepEqual([phoneHelper.display(null), phoneHelper.display("98765 43210")], [null, "98765 43210"]);
    });
});
