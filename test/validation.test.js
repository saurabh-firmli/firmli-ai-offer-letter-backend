import {describe, it} from "node:test";
import assert from "node:assert/strict";

import common from "../src/v1/schemas/validations/common.validation.js";
import applicationValidation from "../src/v1/schemas/validations/application.validation.js";
import userValidation from "../src/v1/schemas/validations/user.validation.js";
import settingsValidation from "../src/v1/schemas/validations/settings.validation.js";
import dropdownValidation from "../src/v1/schemas/validations/dropdown.validation.js";
import letterValidation from "../src/v1/schemas/validations/letter.validation.js";
import letterTemplateValidation from "../src/v1/schemas/validations/letterTemplate.validation.js";
import platformValidation from "../src/v1/schemas/validations/platform.validation.js";

// The error message of one field, or undefined when the value is fine
const errorOf = (schema, value, field) => schema.validate(value, {abortEarly: false}).error?.details.find((detail) => detail.path.join(".") === field)?.message;

describe("dates", () => {
    it("accepts real days only, in YYYY-MM-DD", () => {
        assert.equal(common.day.validate("2026-02-28").error, undefined);
        assert.equal(common.day.validate("2024-02-29").error, undefined);
        for (const bad of ["2026-02-30", "2026-13-01", "26-10-2026", "2026/10/26", "2026-1-5", "tomorrow"]) {
            assert.ok(common.day.validate(bad).error, bad);
        }
    });

    it("refuses a date of birth in the future", () => {
        const student = {firstName: "A", lastName: "B", email: "a@yopmail.com", dateOfBirth: "2999-01-01"};

        assert.equal(errorOf(applicationValidation.create, {student, programId: 1, intakeTerm: "fall", intakeYear: 2026}, "student.dateOfBirth"), "Date of birth cannot be in the future");
    });

    it("keeps the viewer's UTC offset within real time zones", () => {
        const period = common.period.utcOffset;

        assert.equal(period.validate(330).error, undefined);
        assert.equal(period.validate(-720).error, undefined);
        assert.equal(period.validate(840).error, undefined);
        assert.ok(period.validate(841).error);
        assert.ok(period.validate(5.5).error);
        assert.equal(period.validate(undefined).value, 0);
    });
});

describe("pagination", () => {
    it("defaults to page 1 of 20 and caps the page size at 100", () => {
        const page = (query) => common.createSchema(common.pagination).validate(query);

        assert.deepEqual(page({}).value, {page: 1, limit: 20});
        assert.equal(page({limit: "100"}).value.limit, 100);
        assert.ok(page({limit: 101}).error);
        assert.ok(page({page: 0}).error);
        assert.ok(page({page: -1}).error);
        assert.ok(page({page: "two"}).error);
    });
});

describe("emails, phones, passwords", () => {
    it("stores emails trimmed and in lowercase, and refuses non-emails", () => {
        assert.equal(common.email.validate("  Riya@YopMail.COM ").value, "riya@yopmail.com");
        for (const bad of ["riya", "riya@", "@yopmail.com", "riya @yopmail.com"]) assert.ok(common.email.validate(bad).error, bad);
    });

    it("saves phone numbers in E.164: + country code and digits only", () => {
        assert.equal(common.phone.validate("+91 98765 43210").value, "+919876543210");
        assert.equal(common.phone.validate("+91 (20) 5555-0100").value, "+912055550100");
        assert.equal(common.phone.validate("0044 20.7946.0958").value, "+442079460958");
        assert.equal(common.phone.validate("+2348012345678").value, "+2348012345678");
        assert.equal(common.phone.validate("").error, undefined);
        assert.equal(common.phone.validate(null).error, undefined);
    });

    it("asks for the country code, and refuses what is not a phone number", () => {
        for (const bad of ["98765 43210", "09876543210", "+0 98765 43210", "+91 98", "+1234567890123456", "phone 12345", "+91 98765 43210 ext 9", "++919876543210"]) {
            assert.equal(common.phone.validate(bad).error?.message, "Enter the number with its country code, e.g. +919876543210", bad);
        }
    });

    it("asks for a password of 8 to 72 characters (bcrypt reads at most 72 bytes)", () => {
        const user = {name: "Riya", email: "riya@yopmail.com", roleId: 3};

        assert.ok(errorOf(userValidation.create, {...user, password: "short1"}, "password"));
        assert.equal(errorOf(userValidation.create, {...user, password: "x".repeat(72)}, "password"), undefined);
        assert.ok(errorOf(userValidation.create, {...user, password: "x".repeat(73)}, "password"));
    });
});

describe("create and update schemas", () => {
    it("drop fields the API does not know instead of saving them", () => {
        const {value} = userValidation.create.validate({name: "Riya", email: "riya@yopmail.com", password: "Password123", roleId: 3, tenantId: 99, isPlatform: true});

        assert.equal(value.tenantId, undefined);
        assert.equal(value.isPlatform, undefined);
    });

    it("ask for at least one field on an update", () => {
        assert.equal(userValidation.update.validate({}).error.details[0].message, "Send at least one field to update");
        assert.equal(userValidation.update.validate({name: "Riya"}).error, undefined);
    });

    it("refuse ids that are not positive whole numbers", () => {
        for (const bad of [0, -3, 1.5, "abc"]) assert.ok(common.idParam.validate({id: bad}).error, String(bad));
        assert.equal(common.idParam.validate({id: "12"}).value.id, 12);
    });
});

describe("settings", () => {
    it("takes a brand colour as # and 6 hex digits, stored in capitals", () => {
        assert.equal(settingsValidation.update.validate({brandColor: "#0f766e"}).value.brandColor, "#0F766E");
        assert.equal(settingsValidation.update.validate({brandColor: ""}).error, undefined);
        for (const bad of ["0F766E", "#0F766", "#0F766EE", "#GGGGGG", "blue", "rgb(1,2,3)"]) {
            assert.equal(errorOf(settingsValidation.update, {brandColor: bad}, "brandColor"), "Enter a colour like #1E3A8A", bad);
        }
    });

    it("keeps confidence thresholds between 0 and 1", () => {
        assert.equal(settingsValidation.update.validate({offerConfidenceThreshold: 0.85}).error, undefined);
        assert.ok(settingsValidation.update.validate({offerConfidenceThreshold: 1.2}).error);
        assert.ok(settingsValidation.update.validate({rejectionConfidenceThreshold: -0.1}).error);
    });

    it("limits email retries to 0 to 10", () => {
        assert.equal(settingsValidation.update.validate({emailMaxRetries: 0}).error, undefined);
        assert.ok(settingsValidation.update.validate({emailMaxRetries: 11}).error);
    });
});

describe("dropdowns", () => {
    it("accept only known filters", () => {
        assert.equal(dropdownValidation.programs.validate({status: "active", withEligibilitySet: "true"}).value.withEligibilitySet, true);
        assert.ok(dropdownValidation.programs.validate({status: "open"}).error);
        assert.ok(dropdownValidation.campuses.validate({status: "active"}).error);
        assert.ok(dropdownValidation.roles.validate({search: "x"}).error);
    });

    it("take a role code of lowercase letters and _ only", () => {
        assert.equal(dropdownValidation.users.validate({role: "admissions_officer", assignable: "true"}).error, undefined);
        for (const bad of ["Reviewer", "drop table", "a;b", "x".repeat(51)]) assert.ok(dropdownValidation.users.validate({role: bad}).error, bad);
    });

    it("check template types", () => {
        assert.equal(dropdownValidation.letterTemplates.validate({letterType: "rejection", status: "published"}).error, undefined);
        assert.ok(dropdownValidation.letterTemplates.validate({letterType: "document_request"}).error);
        assert.equal(dropdownValidation.emailTemplates.validate({emailType: "document_request"}).error, undefined);
    });
});

describe("letters", () => {
    it("download as a file unless inline=true", () => {
        assert.equal(letterValidation.downloadUrl.validate({}).value.inline, false);
        assert.equal(letterValidation.downloadUrl.validate({inline: "true"}).value.inline, true);
        assert.ok(letterValidation.downloadUrl.validate({inline: "maybe"}).error);
    });

    it("ask for the reason when a letter is rejected", () => {
        assert.ok(letterValidation.reject.validate({}).error);
        assert.ok(letterValidation.reject.validate({note: "   "}).error);
        assert.equal(letterValidation.approve.validate({}).error, undefined);
    });

    it("need an application to preview a template", () => {
        assert.ok(letterValidation.preview.validate({}).error);
        assert.equal(letterValidation.preview.validate({applicationId: "85"}).value.applicationId, 85);
    });

    it("store the reference prefix in capitals", () => {
        const template = {name: "Offer", letterType: "conditional_offer", body: "Dear {{student_full_name}}"};

        assert.equal(letterTemplateValidation.create.validate({...template, referencePrefix: "ofr"}).value.referencePrefix, "OFR");
        assert.ok(letterTemplateValidation.create.validate({...template, referencePrefix: "OFFER-LETTER-2026"}).error);
    });
});

describe("platform", () => {
    it("needs both ids to send a user's login details", () => {
        assert.equal(platformValidation.userParams.validate({id: "4", userId: "9"}).error, undefined);
        assert.ok(platformValidation.userParams.validate({id: "4"}).error);
        assert.ok(platformValidation.sendCredentials.validate({}).error);
    });
});
