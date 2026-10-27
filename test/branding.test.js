import {describe, it} from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";

import pdfHelper from "../src/v1/helpers/pdf.helper.js";
import emailHelper, {LOGO_CID} from "../src/v1/helpers/email.helper.js";

// A tiny valid PNG (1 x 1, one colour), as the logo
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
    const pixels = zlib.deflateSync(Buffer.from([0, 30, 58, 138]));
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", pixels), chunk("IEND", Buffer.alloc(0))]);
};
const LOGO = `data:image/png;base64,${png().toString("base64")}`;
const brand = {color: "#0F766E", name: "Apex University", address: "1 Road, Pune", website: "https://apex.example.com", email: "admissions@yopmail.com", phone: "+91 20 5555 0100"};
const find = (node, test) => {
    if (Array.isArray(node)) return node.map((item) => find(item, test)).find(Boolean);
    if (!node || typeof node !== "object") return undefined;
    if (test(node)) return node;
    return Object.values(node).map((value) => find(value, test)).find(Boolean);
};

describe("letter PDF letterhead", () => {
    it("puts the logo left and the institution's details right", () => {
        const [row, line] = pdfHelper.letterhead({...brand, logo: LOGO}, null, brand.color);

        assert.equal(row.columns[0].image, LOGO);
        assert.deepEqual(row.columns[1].stack.map((item) => item.text ?? item), ["Apex University", "1 Road, Pune", "https://apex.example.com", "admissions@yopmail.com  ·  +91 20 5555 0100"]);
        assert.equal(line.canvas[0].lineColor, "#0F766E");
    });

    it("lets the template's own header replace the details", () => {
        const header = pdfHelper.toContent("<p>Apex | apex.example.com</p>", brand.color);
        const [withLogo] = pdfHelper.letterhead({...brand, logo: LOGO}, header, brand.color);
        const [withoutLogo] = pdfHelper.letterhead(brand, header, brand.color);

        assert.equal(withLogo.columns[1].stack, header);
        assert.equal(withoutLogo.columns.length, 1);
        assert.equal(withoutLogo.columns[0].stack, header);
    });

    it("shows the name in the brand colour without a logo, and skips missing details", () => {
        const [row] = pdfHelper.letterhead({name: "Apex University", website: "https://apex.example.com"}, null, "#1E3A8A");

        assert.deepEqual([row.columns[0].text, row.columns[0].color], ["Apex University", "#1E3A8A"]);
        assert.deepEqual(row.columns[1].stack, ["https://apex.example.com"]);
    });

    it("makes a PDF with the logo, and one without any brand at all", async () => {
        const branded = await pdfHelper.fromHtml({title: "OFR-1", bodyHtml: "<p>Dear Amara</p>", brand: {...brand, logo: LOGO}});
        const plain = await pdfHelper.fromHtml({title: "OFR-2", bodyHtml: "<p>Dear Amara</p>"});

        assert.equal(branded.includes(Buffer.from("/Subtype /Image")), true);
        assert.equal(plain.subarray(0, 5).toString(), "%PDF-");
        assert.equal(plain.includes(Buffer.from("/Subtype /Image")), false);
    });

    it("keeps working with a long letter across pages", async () => {
        const rows = Array.from({length: 120}, (_, index) => `<tr><td>Row ${index}</td><td>Value</td></tr>`).join("");
        const pdf = await pdfHelper.fromHtml({title: "Long", bodyHtml: `<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody>${rows}</tbody></table>`, brand});

        assert.ok(Number(pdf.toString("latin1").match(/\/Count (\d+)/)[1]) > 1);
    });
});

describe("letter PDF content", () => {
    it("gives tables the brand look: header colour, layout, rows kept whole, full width", () => {
        const content = pdfHelper.toContent("<table><thead><tr><th>Requirement</th><th>Result</th></tr></thead><tbody><tr><td>Minimum GPA on a 4.0 scale</td><td>Y</td></tr></tbody></table>", "#7C3AED");
        const table = find(content, (node) => node.table);

        assert.equal(table.layout.vLineWidth(), 0);
        assert.equal(table.table.dontBreakRows, true);
        assert.deepEqual(table.table.widths, ["*", "auto"]);
        assert.equal(find(table.table.body[0], (node) => node.fillColor)?.fillColor, "#7C3AED");
    });

    it("keeps a layout or widths the template asked for", () => {
        const content = pdfHelper.toContent(`<table data-pdfmake='{"layout":"noBorders","widths":[100,"*"]}'><tr><td>a</td><td>b</td></tr></table>`);
        const table = find(content, (node) => node.table);

        assert.equal(table.layout, "noBorders");
        assert.deepEqual(table.table.widths, [100, "*"]);
    });

    it("keeps inline PNG / JPEG images and drops everything else that could load or run something", () => {
        const html = `<p>Hi</p><img src="${LOGO}"><img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="><img src="file:///etc/passwd">
            <iframe src="https://x.example.com"></iframe><style>p{color:red}</style><object data="x"></object><link rel="stylesheet" href="https://x.example.com/a.css">`;
        const content = JSON.stringify(pdfHelper.toContent(html));

        assert.equal(content.includes("data:image/png;base64"), true);
        for (const gone of ["svg+xml", "file:///", "x.example.com", "color:red"]) assert.equal(content.includes(gone), false, gone);
    });

    it("colours headings and links with the brand", () => {
        const content = pdfHelper.toContent('<h2>Conditions</h2><a href="https://apex.example.com">site</a>', "#B91C1C");

        assert.equal(find(content, (node) => node.text === "Conditions")?.color, "#B91C1C");
        assert.equal(find(content, (node) => node.link)?.color, "#B91C1C");
    });

    it("always answers a list, even for empty or plain text", () => {
        assert.ok(Array.isArray(pdfHelper.toContent("")));
        assert.ok(Array.isArray(pdfHelper.toContent("just text")));
    });
});

describe("student email layout", () => {
    it("shows the logo by its content id, the brand bar, the attachment and the footer", () => {
        const html = emailHelper.layout({title: null, body: "<p>Dear Amara</p>", brand: {...brand, hasLogo: true}, attachmentName: "OFR-1.pdf"});

        assert.match(html, new RegExp(`<img src="cid:${LOGO_CID}" alt="Apex University"`));
        assert.match(html, /background:#0F766E;height:4px/);
        assert.match(html, /<strong>OFR-1\.pdf<\/strong> is attached to this email/);
        assert.match(html, /admissions@yopmail\.com &nbsp;·&nbsp; \+91 20 5555 0100/);
        assert.match(html, /Questions\? Just reply to this email\./);
    });

    it("escapes the institution's details and the file name", () => {
        const html = emailHelper.layout({body: "<p>x</p>", brand: {name: '<script>alert(1)</script>"', address: "<b>1</b>", hasLogo: true}, attachmentName: "<img onerror=x>.pdf"});

        assert.equal(html.includes("<script>"), false);
        assert.equal(html.includes("<img onerror"), false);
        assert.match(html, /alt="&lt;script&gt;alert\(1\)&lt;\/script&gt;&quot;"/);
        assert.match(html, /&lt;b&gt;1&lt;\/b&gt;/);
    });

    it("writes the name instead of the logo, and leaves out what is missing", () => {
        const html = emailHelper.layout({body: "<p>x</p>", brand: {name: "Apex", hasLogo: false}});

        assert.equal(html.includes("cid:"), false);
        assert.match(html, /<span style="font-size:20px;font-weight:bold;color:#1E3A8A">Apex<\/span>/);
        assert.equal(html.includes("is attached"), false);
        assert.equal(html.includes("Questions?"), false);
    });

    it("keeps staff emails plain: no brand bar, no institution footer", () => {
        const html = emailHelper.layout({title: "Your login details", body: "<p>Hi</p>", footer: "Firmli"});

        assert.equal(html.includes("height:4px"), false);
        assert.match(html, /<h1 style="margin:0 0 16px;font-size:20px;color:#111827">Your login details<\/h1>/);
    });
});

describe("sending email", () => {
    it("answers 503 Email is not configured when there is no mail server", async () => {
        await assert.rejects(emailHelper.send({tenantId: null, to: "a@yopmail.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi"}), (error) => error.statusCode === 503 && error.message === "Email is not configured");
    });

    it("makes a new Message-ID each time, on the sender's domain", () => {
        const first = emailHelper.newMessageId();

        assert.match(first, /^<[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@[^@>]+>$/);
        assert.notEqual(emailHelper.newMessageId(), first);
    });

    it("sends the email without the logo when it cannot be read", async () => {
        assert.equal(await emailHelper.logoAttachment(null), null);
        assert.equal(await emailHelper.logoAttachment("tenants/1/branding/logo.png"), null);
    });
});
