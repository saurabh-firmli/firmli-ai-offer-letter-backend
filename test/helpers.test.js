import {describe, it} from "node:test";
import assert from "node:assert/strict";

import criteriaHelper from "../src/v1/helpers/criteria.helper.js";
import csvHelper from "../src/v1/helpers/csv.helper.js";
import cryptoHelper from "../src/v1/helpers/crypto.helper.js";
import dateHelper from "../src/v1/helpers/date.helper.js";
import pdfHelper from "../src/v1/helpers/pdf.helper.js";
import templateHelper from "../src/v1/helpers/template.helper.js";

describe("criteriaHelper.evaluate", () => {
    const gpa = {dataType: "number", operator: "greater_than_or_equal", requiredValue: "3.0"};

    it("compares numbers", () => {
        assert.equal(criteriaHelper.evaluate(gpa, "3.62"), "met");
        assert.equal(criteriaHelper.evaluate(gpa, "3.0"), "met");
        assert.equal(criteriaHelper.evaluate(gpa, "2.4"), "not_met");
    });

    it("is unclear without a value, or with one that is not a number", () => {
        assert.equal(criteriaHelper.evaluate(gpa, null), "unclear");
        assert.equal(criteriaHelper.evaluate(gpa, ""), "unclear");
        assert.equal(criteriaHelper.evaluate(gpa, "good"), "unclear");
    });

    it("handles between, one of, dates, yes / no and text", () => {
        assert.equal(criteriaHelper.evaluate({dataType: "number", operator: "between", requiredValue: "6,9"}, "7.5"), "met");
        assert.equal(criteriaHelper.evaluate({dataType: "number", operator: "one_of", requiredValue: "1,2"}, "3"), "not_met");
        assert.equal(criteriaHelper.evaluate({dataType: "date", operator: "less_than", requiredValue: "2026-01-01"}, "2025-07-15"), "met");
        assert.equal(criteriaHelper.evaluate({dataType: "boolean", operator: "equal_to", requiredValue: "true"}, "yes"), "met");
        assert.equal(criteriaHelper.evaluate({dataType: "text", operator: "equal_to", requiredValue: "Nigeria"}, " nigeria "), "met");
    });

    it("knows which criteria are in force on a day", () => {
        assert.equal(criteriaHelper.isInForce({effectiveDate: "2026-01-01", expiryDate: null}, "2026-06-01"), true);
        assert.equal(criteriaHelper.isInForce({effectiveDate: null, expiryDate: "2025-12-31"}, "2026-06-01"), false);
    });
});

describe("csvHelper", () => {
    it("escapes quotes, commas and line breaks", () => {
        assert.equal(csvHelper.cell('say "hi"'), '"say ""hi"""');
        assert.equal(csvHelper.cell("a,b"), '"a,b"');
        assert.equal(csvHelper.cell(null), "");
    });

    it("writes formula-like cells as text, so a spreadsheet never runs them", () => {
        assert.equal(csvHelper.cell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
        assert.equal(csvHelper.cell("@x"), "'@x");
    });

    it("starts the file with a BOM and a header row", () => {
        const csv = csvHelper.toCsv([{header: "Name", value: (row) => row.name}], [{name: "José"}]);

        assert.equal(csv, "﻿Name\r\nJosé\r\n");
    });
});

describe("cryptoHelper", () => {
    it("decrypts what it encrypted", () => {
        const stored = cryptoHelper.encrypt("sk-proj-secret");

        assert.match(stored, /^v1:/);
        assert.notEqual(stored, cryptoHelper.encrypt("sk-proj-secret"));
        assert.equal(cryptoHelper.decrypt(stored), "sk-proj-secret");
    });

    it("refuses a changed value instead of returning wrong text", () => {
        const [version, iv, tag] = cryptoHelper.encrypt("sk-proj-secret").split(":");
        const tampered = [version, iv, tag, Buffer.from("other").toString("base64")].join(":");

        assert.throws(() => cryptoHelper.decrypt(tampered));
    });
});

describe("dateHelper", () => {
    it("gives the viewer's own day", () => {
        assert.equal(dateHelper.localDate(new Date("2026-10-25T20:00:00Z"), 330), "2026-10-26");
        assert.equal(dateHelper.localDate(new Date("2026-10-25T20:00:00Z"), 0), "2026-10-25");
    });

    it("fills the days of a chart that have no rows", () => {
        const days = dateHelper.fillDays([{date: "2026-10-02", count: 3}], "2026-10-01", "2026-10-03", (date) => ({date, count: 0}));

        assert.deepEqual(days.map((day) => day.count), [0, 3, 0]);
    });

    it("refuses a period that ends before it starts", () => {
        assert.throws(() => dateHelper.chartRange({from: "2026-10-05", to: "2026-10-01", utcOffset: 0}, 30));
    });
});

describe("templateHelper.variablesIn", () => {
    it("finds every variable once, spaces allowed", () => {
        assert.deepEqual(templateHelper.variablesIn("Dear {{ student_full_name }}, {{program_name}} {{student_full_name}}"), [
            "student_full_name",
            "program_name",
        ]);
    });
});

describe("templateHelper.toHtml", () => {
    it("turns plain text into paragraphs and line breaks, escaping it", () => {
        assert.equal(templateHelper.toHtml("A & B\nnext line\n\nNew paragraph"), "<p>A &amp; B<br>next line</p><p>New paragraph</p>");
    });

    it("leaves an HTML template as it is", () => {
        assert.equal(templateHelper.toHtml("<p>Dear {{student_full_name}}</p>"), "<p>Dear {{student_full_name}}</p>");
    });
});

describe("pdfHelper", () => {
    it("makes a PDF from HTML", async () => {
        const pdf = await pdfHelper.fromHtml({title: "OFR-1", bodyHtml: "<h2>Offer</h2><p>Dear <b>Amara</b></p><table><tr><td>GPA</td><td>3.6</td></tr></table>"});

        assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    });

    it("accepts a plain-text header and footer (no HTML tags)", async () => {
        const pdf = await pdfHelper.fromHtml({title: "OFR-2", headerHtml: "Sunrise University | https://x.example.com", bodyHtml: "Dear Amara", footerHtml: "Ludhiana"});

        assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    });

    it("drops remote images and scripts, so nothing is fetched", () => {
        const content = JSON.stringify(pdfHelper.toContent('<p>Hi</p><img src="https://example.com/x.png"><script>alert(1)</script>'));

        assert.equal(content.includes("example.com"), false);
        assert.equal(content.includes("alert"), false);
        assert.equal(content.includes("Hi"), true);
    });
});
