import {describe, it} from "node:test";
import assert from "node:assert/strict";

import letterService from "../src/v1/services/letter.service.js";
import communicationService from "../src/v1/services/communication.service.js";
import authValidation from "../src/v1/schemas/validations/auth.validation.js";
import platformValidation from "../src/v1/schemas/validations/platform.validation.js";
import settingsValidation from "../src/v1/schemas/validations/settings.validation.js";

// Business rules that need no database
describe("letters", () => {
    const values = {
        student_full_name: {text: "O'Brien & <Sons>", html: "O&#39;Brien &amp; &lt;Sons&gt;"},
        eligibility_table: {text: "GPA: met", html: "<table><tr><td>GPA</td></tr></table>"},
    };

    it("fills the subject as text and the body as escaped HTML", () => {
        const letter = letterService.render({subject: "Offer for {{student_full_name}}", body: "<p>Dear {{ student_full_name }}</p>{{eligibility_table}}"}, values);

        assert.equal(letter.subject, "Offer for O'Brien & <Sons>");
        assert.equal(letter.bodyHtml, "<p>Dear O&#39;Brien &amp; &lt;Sons&gt;</p><table><tr><td>GPA</td></tr></table>");
        assert.equal(letter.headerHtml, null);
    });

    it("leaves no placeholder behind, even for an unknown variable", () => {
        assert.equal(letterService.render({body: "<p>Hi {{unknown}}</p>"}, values).bodyHtml, "<p>Hi </p>");
    });

    it("keeps the lines of a template typed as plain text", () => {
        const letter = letterService.render({headerHtml: "Sunrise | 2026", body: "Dear {{student_full_name}},\n\nWelcome.\nSee you soon.\n\n{{eligibility_table}}"}, values);

        assert.equal(letter.headerHtml, "<p>Sunrise | 2026</p>");
        assert.equal(letter.bodyHtml, "<p>Dear O&#39;Brien &amp; &lt;Sons&gt;,</p><p>Welcome.<br>See you soon.</p><p><table><tr><td>GPA</td></tr></table></p>");
    });

    it("approves at once only what Settings allow", () => {
        const settings = {autoApproveOffers: true, autoApproveRejections: true, requireRejectionApproval: true};

        assert.equal(letterService.isApprovedAutomatically("conditional_offer", settings), true);
        assert.equal(letterService.isApprovedAutomatically("rejection", settings), false);
        assert.equal(letterService.isApprovedAutomatically("rejection", {...settings, requireRejectionApproval: false}), true);
        assert.equal(letterService.isApprovedAutomatically("manual_review", settings), false);
    });
});

describe("email retries", () => {
    const minutesUntil = (date) => Math.round((date.getTime() - Date.now()) / 60_000);

    it("waits longer after each failed try, at most 6 hours", () => {
        assert.equal(minutesUntil(communicationService.nextRetryAt(1)), 5);
        assert.equal(minutesUntil(communicationService.nextRetryAt(2)), 10);
        assert.equal(minutesUntil(communicationService.nextRetryAt(3)), 20);
        assert.equal(minutesUntil(communicationService.nextRetryAt(20)), 360);
    });
});

describe("validation", () => {
    it("refuses a new password equal to the current one", () => {
        const {error} = authValidation.changePassword.validate({currentPassword: "Password123", newPassword: "Password123"});

        assert.equal(error.details[0].message, "The new password must be different from the current one");
    });

    it("stores an institution code in capitals and refuses odd characters", () => {
        const admin = {name: "Riya", email: "riya@yopmail.com", password: "TempPass123"};

        assert.equal(platformValidation.create.validate({name: "Apex", code: "apex-1", admin}).value.code, "APEX-1");
        assert.ok(platformValidation.create.validate({name: "Apex", code: "bad code!", admin}).error);
        assert.ok(platformValidation.create.validate({name: "Apex"}).error);
    });

    it("accepts only a full web address as the institution website", () => {
        assert.equal(settingsValidation.update.validate({website: "https://www.apex.example.com"}).error, undefined);
        assert.ok(settingsValidation.update.validate({website: "www.apex.example.com"}).error);
        assert.ok(settingsValidation.update.validate({website: "javascript:alert(1)"}).error);
    });
});
