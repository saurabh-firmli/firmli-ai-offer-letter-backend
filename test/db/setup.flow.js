import {before, describe, it} from "node:test";
import assert from "node:assert/strict";
import {startApp} from "./context.js";

// What an institution sets up before applications come in: campuses, eligibility sets, programs,
// letter and email templates, and the dropdowns that list them. Each tenant sees only its own.
const {newTenant, db} = await startApp();

const PUNE = 1;
const LONDON = 3;
let apex;
let other;
let options;
const category = (code) => options.categories.find((item) => item.code === code).id;
const documentType = (code) => options.documentTypes.find((item) => item.code === code).id;

before(async () => {
    apex = await newTenant("Apex University", "admin.apex@yopmail.com");
    other = await newTenant("Other College", "admin.other@yopmail.com");
    options = (await apex.api.get("/eligibility/options")).body.data;
});

describe("campuses", () => {
    let campus;

    it("creates a campus in a city, and lists it by name with its city", async () => {
        const res = await apex.api.post("/campuses", {name: "Main Campus", cityId: PUNE});
        campus = res.body.data;

        assert.equal(res.status, 201);
        assert.deepEqual((await apex.api.get("/dropdowns/campuses")).body.data, [{value: campus.id, label: "Main Campus (Pune)"}]);
    });

    it("refuses an unknown city and an empty name", async () => {
        assert.equal((await apex.api.post("/campuses", {name: "X", cityId: 999999})).status, 422);
        assert.equal((await apex.api.post("/campuses", {name: "", cityId: PUNE})).status, 422);
    });

    it("keeps campuses to their tenant", async () => {
        assert.equal((await other.api.get(`/campuses/${campus.id}`)).status, 404);
        assert.equal((await other.api.patch(`/campuses/${campus.id}`, {name: "Mine"})).status, 404);
        assert.equal((await other.api.delete(`/campuses/${campus.id}`)).status, 404);
        assert.deepEqual((await other.api.get("/dropdowns/campuses")).body.data, []);
    });

    it("updates and deletes a campus nobody uses", async () => {
        const spare = (await apex.api.post("/campuses", {name: "Spare Campus", cityId: LONDON})).body.data;

        assert.equal((await apex.api.patch(`/campuses/${spare.id}`, {name: "City Campus"})).body.data.name, "City Campus");
        assert.equal((await apex.api.delete(`/campuses/${spare.id}`)).status, 200);
        assert.equal((await apex.api.get(`/campuses/${spare.id}`)).status, 404);
        assert.deepEqual((await db.select("SELECT deleted_at IS NOT NULL AS deleted FROM campuses WHERE id = :id", {id: spare.id})).map((row) => row.deleted), [1]);
    });
});

describe("eligibility sets", () => {
    let set;
    let v1;
    let gpa;

    it("starts a set with a draft version 1, and names stay unique per tenant", async () => {
        set = (await apex.api.post("/eligibility/sets", {name: "UK Masters Standard"})).body.data;
        v1 = set.versions[0].id;

        assert.deepEqual(set.versions.map((version) => [version.versionNumber, version.status]), [[1, "draft"]]);
        assert.equal((await apex.api.post("/eligibility/sets", {name: "uk masters standard"})).status, 409);
        assert.equal((await other.api.post("/eligibility/sets", {name: "UK Masters Standard"})).status, 201);
    });

    it("adds criteria and checks the value against its type", async () => {
        const criterion = (body) => apex.api.post(`/eligibility/versions/${v1}/criteria`, {categoryId: category("academic_qualification"), ...body});
        const res = await criterion({name: "Minimum GPA", dataType: "number", operator: "greater_than_or_equal", unit: "GPA", requiredValue: "3.0", documentTypeIds: [documentType("academic_transcript")]});
        gpa = res.body.data;

        assert.deepEqual([res.status, gpa.isMandatory, gpa.documentTypes.map((type) => type.label)], [201, true, ["Academic Transcript"]]);
        assert.deepEqual((await criterion({name: "X", dataType: "number", operator: "equal_to", requiredValue: "abc"})).body.errors, {requiredValue: "Enter a number, e.g. 3.0"});
        assert.deepEqual((await criterion({name: "X", dataType: "boolean", operator: "greater_than", requiredValue: "true"})).body.errors, {operator: "Greater than cannot be used with Yes / No"});
        assert.deepEqual((await criterion({name: "X", dataType: "number", operator: "between", requiredValue: "4,3"})).body.errors, {requiredValue: "The first value must not be greater than the second"});
        assert.deepEqual((await criterion({name: "X", dataType: "text", operator: "equal_to", requiredValue: "a", documentTypeIds: [9999]})).body.errors, {documentTypeIds: "Document type not found"});
    });

    it("asks for documents, each type once", async () => {
        const res = await apex.api.post(`/eligibility/versions/${v1}/documents`, {documentTypeId: documentType("passport")});

        assert.deepEqual([res.status, res.body.data.documentType, res.body.data.isRequired], [201, "Passport", true]);
        assert.equal((await apex.api.post(`/eligibility/versions/${v1}/documents`, {documentTypeId: documentType("passport")})).status, 409);
    });

    it("locks a version once published; a new version copies it and archives the old one when published", async () => {
        assert.equal((await apex.api.post(`/eligibility/versions/${v1}/publish`)).body.data.status, "published");
        assert.equal((await apex.api.patch(`/eligibility/criteria/${gpa.id}`, {name: "x"})).status, 409);

        const v2 = (await apex.api.post(`/eligibility/sets/${set.id}/versions`)).body.data;
        assert.deepEqual([v2.versionNumber, v2.status, v2.criteria.map((item) => item.name), v2.documentRequirements.length], [2, "draft", ["Minimum GPA"], 1]);
        assert.equal((await apex.api.post(`/eligibility/sets/${set.id}/versions`)).status, 409);

        await apex.api.post(`/eligibility/versions/${v2.id}/publish`);
        assert.equal((await apex.api.get(`/eligibility/versions/${v1}`)).body.data.status, "archived");
        assert.equal((await apex.api.delete(`/eligibility/versions/${v2.id}`)).status, 409);
    });

    it("refuses publishing an empty draft", async () => {
        const empty = (await apex.api.post("/eligibility/sets", {name: "Empty Set"})).body.data;

        assert.equal((await apex.api.post(`/eligibility/versions/${empty.versions[0].id}/publish`)).status, 409);
        assert.deepEqual((await apex.api.get("/dropdowns/eligibility-sets?published=true")).body.data.map((option) => option.label), ["UK Masters Standard"]);
    });

    it("keeps sets and versions to their tenant", async () => {
        assert.equal((await other.api.get(`/eligibility/versions/${v1}`)).status, 404);
        assert.equal((await other.api.patch(`/eligibility/criteria/${gpa.id}`, {name: "x"})).status, 404);
    });
});

describe("templates", () => {
    it("creates letter templates, with the reference prefix in capitals", async () => {
        const res = await apex.api.post("/letter-templates", {name: "Conditional Offer", letterType: "conditional_offer", referencePrefix: "ofr", body: "<p>Dear {{student_full_name}}</p>", status: "published"});

        assert.deepEqual([res.status, res.body.data.referencePrefix], [201, "OFR"]);
        assert.equal((await apex.api.post("/letter-templates", {name: "Conditional Offer", letterType: "conditional_offer", body: "<p>x</p>"})).status, 409);
    });

    it("creates email templates", async () => {
        const res = await apex.api.post("/email-templates", {name: "Offer Email", emailType: "conditional_offer", subject: "Your offer", body: "<p>Dear {{student_full_name}}</p>", attachPdfLetter: true, status: "published"});
        const unknown = await apex.api.post("/email-templates", {name: "Bad", emailType: "custom", body: "<p>Dear {{student_nickname}}</p>"});

        assert.equal(res.status, 201);
        assert.deepEqual(unknown.body.errors, {body: "body uses unknown variables: student_nickname"});
        assert.deepEqual((await apex.api.get("/dropdowns/email-templates?emailType=conditional_offer")).body.data.map((option) => option.label), ["Offer Email"]);
        assert.deepEqual((await apex.api.get("/dropdowns/email-templates?emailType=rejection")).body.data, []);
    });

    it("lists the variables a template can use", async () => {
        const variables = (await apex.api.get("/letter-templates/variables")).body.data;

        assert.ok(JSON.stringify(variables).includes("student_full_name"));
    });
});

describe("programs", () => {
    let campus;
    let set;
    let template;
    let program;

    before(async () => {
        campus = (await apex.api.get("/dropdowns/campuses")).body.data[0];
        set = (await apex.api.get("/dropdowns/eligibility-sets?published=true")).body.data[0];
        template = (await apex.api.get("/dropdowns/letter-templates?letterType=conditional_offer")).body.data[0];
    });

    it("creates a program on a campus, with an eligibility set and an offer template", async () => {
        const res = await apex.api.post("/programs", {name: "MSc Data Science", code: "MSDS", campusId: campus.value, duration: "1 year", status: "active", eligibilitySetId: set.value, conditionalOfferTemplateId: template.value});
        program = res.body.data;

        assert.equal(res.status, 201);
        assert.deepEqual(program.eligibilitySet, {id: set.value, name: "UK Masters Standard", publishedVersion: 2});
        assert.deepEqual((await apex.api.get("/dropdowns/programs?withEligibilitySet=true")).body.data, [{value: program.id, label: "MSc Data Science (MSDS)", eligibilitySet: {id: set.value, name: "UK Masters Standard"}}]);
    });

    it("refuses a taken code, a missing campus, and another tenant's campus or set", async () => {
        const body = {name: "X", code: "XX", campusId: campus.value, duration: "1 year"};
        const otherCampus = (await other.api.post("/campuses", {name: "Other Campus", cityId: LONDON})).body.data;
        const otherSet = (await other.api.get("/dropdowns/eligibility-sets")).body.data[0];

        assert.equal((await apex.api.post("/programs", {...body, code: "msds"})).status, 409);
        assert.deepEqual((await apex.api.post("/programs", {...body, campusId: undefined})).body.errors, {campusId: "Select a campus"});
        assert.equal((await apex.api.post("/programs", {...body, campusId: otherCampus.id})).status, 422);
        assert.deepEqual((await apex.api.post("/programs", {...body, eligibilitySetId: otherSet.value})).body.errors, {eligibilitySetId: "Eligibility set not found"});
    });

    it("finds programs by search and status", async () => {
        await apex.api.post("/programs", {name: "MBA", code: "MBA", campusId: campus.value, duration: "2 years", status: "draft"});

        assert.equal((await apex.api.get("/programs?search=MSDS")).body.data.total, 1);
        assert.deepEqual((await apex.api.get("/dropdowns/programs?status=active")).body.data.map((option) => option.label), ["MSc Data Science (MSDS)"]);
        assert.equal((await other.api.get(`/programs/${program.id}`)).status, 404);
    });

    it("keeps what a program uses from being deleted", async () => {
        assert.equal((await apex.api.delete(`/campuses/${campus.value}`)).status, 409);
        assert.equal((await apex.api.delete(`/eligibility/sets/${set.value}`)).status, 409);
        assert.equal((await apex.api.delete(`/letter-templates/${template.value}`)).status, 409);
    });

    it("deletes a program: its code is free again, and what it used can be deleted", async () => {
        assert.equal((await apex.api.delete(`/programs/${program.id}`)).status, 200);

        assert.equal((await apex.api.get(`/programs/${program.id}`)).status, 404);
        assert.equal((await apex.api.delete(`/letter-templates/${template.value}`)).status, 200);
        assert.equal((await apex.api.post("/programs", {name: "MSc Data Science", code: "MSDS", campusId: campus.value, duration: "1 year"})).status, 201);
    });
});
