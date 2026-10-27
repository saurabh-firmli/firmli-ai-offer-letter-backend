import path from "node:path";
import {createRequire} from "node:module";
import _ from "lodash";
import pdfmake from "pdfmake";
import htmlToPdfmake from "html-to-pdfmake";
import {JSDOM} from "jsdom";
import {DEFAULT_BRAND_COLOR} from "../constants/settings.constants.js";

const require = createRequire(import.meta.url);
const fonts = require("pdfmake/fonts/Roboto.js");
const FONTS_DIR = path.resolve(path.dirname(fonts.Roboto.normal)) + path.sep;

pdfmake.addFonts(fonts);
// Never fetch a URL or read a file from a template: only our own fonts are read
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((file) => path.resolve(file).startsWith(FONTS_DIR));

// pdfmake draws PNG and JPEG; anything else (or a remote image) is dropped from the HTML
const EMBEDDABLE_IMAGE = /^data:image\/(png|jpe?g);base64,/i;
// One DOM for reading HTML, made once: each call works in its own detached element
const {window} = new JSDOM("");

// A4 in points, and the page layout around the letter
const PAGE_WIDTH = 595.28;
const MARGIN_X = 50;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN_X;
const LETTERHEAD_TOP = 32;
const TEXT = "#1F2937";
const MUTED = "#6B7280";
const RULE = "#E5E7EB";
const STRIPE = "#F8FAFC";

// Tables: no vertical lines, thin rules between rows, every other row tinted; the header row gets the brand colour
const TABLE_LAYOUT = {
    hLineWidth: (index) => (index === 0 ? 0 : 0.5),
    vLineWidth: () => 0,
    hLineColor: () => RULE,
    fillColor: (rowIndex, node) => (rowIndex >= (node.table.headerRows ?? 0) && rowIndex % 2 === 0 ? STRIPE : null),
    paddingLeft: () => 6,
    paddingRight: () => 6,
    paddingTop: () => 4,
    paddingBottom: () => 4,
};

const rule = (lineWidth, lineColor, marginTop = 0) => ({
    canvas: [{type: "line", x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth, lineColor}],
    margin: [0, marginTop, 0, 0],
});

const contactLine = (brand) => _.compact([brand.website, brand.email, brand.phone]).join("  ·  ");

/**
 * Letters as PDF, from HTML, without a browser: html-to-pdfmake turns the HTML into a pdfmake document
 * (paragraphs, headings, bold / italic, lists, tables, inline PNG / JPEG images, basic inline styles).
 * Layout CSS (flex, grid, floats) is not supported.
 *
 * Every page is branded: a letterhead with the institution's logo and details (or the template's header)
 * over a line in its colour, tables and headings in that colour, and a footer with page numbers.
 *
 *   const buffer = await pdfHelper.fromHtml({title: "OFR-37829249-1", headerHtml, bodyHtml, footerHtml,
 *       brand: {color: "#1E3A8A", logo: "data:image/png;base64,...", name, address, website, email, phone}});
 */
const pdfHelper = {
    fromHtml: async ({title, headerHtml, bodyHtml, footerHtml, brand = {}}) => {
        const color = brand.color ?? DEFAULT_BRAND_COLOR;
        const header = headerHtml ? pdfHelper.toContent(headerHtml, color) : null;
        const footer = footerHtml ? pdfHelper.toContent(footerHtml, color) : null;
        const letterhead = pdfHelper.letterhead(brand, header, color);
        const document = {
            info: {title, author: brand.name},
            pageSize: "A4",
            pageMargins: [MARGIN_X, 120, MARGIN_X, 70],
            defaultStyle: {font: "Roboto", fontSize: 10, lineHeight: 1.25, color: TEXT},
            content: pdfHelper.toContent(bodyHtml, color),
            // A fresh copy per page: pdfmake changes the nodes while it lays them out
            header: () => ({stack: _.cloneDeep(letterhead), margin: [MARGIN_X, LETTERHEAD_TOP, MARGIN_X, 0]}),
            footer: (currentPage, pageCount) => ({
                margin: [MARGIN_X, 14, MARGIN_X, 0],
                stack: [
                    rule(0.75, RULE),
                    {
                        columns: [
                            {width: "*", stack: footer ? _.cloneDeep(footer) : [{text: contactLine(brand)}]},
                            {width: "auto", text: `Page ${currentPage} of ${pageCount}`, alignment: "right"},
                        ],
                        columnGap: 12,
                        fontSize: 8,
                        color: MUTED,
                        margin: [0, 6, 0, 0],
                    },
                ],
            }),
        };
        return pdfmake.createPdf(document).getBuffer();
    },

    /**
     * Logo on the left; on the right the template's header, or the institution's name, address and contacts.
     * Without a logo the name stands on the left in the brand colour (or the template's header takes the row).
     */
    letterhead: (brand, header, color) => {
        const details = (withName) =>
            _.compact([withName && brand.name && {text: brand.name, bold: true, fontSize: 11, color}, brand.address, brand.website, _.compact([brand.email, brand.phone]).join("  ·  ") || null]);
        let columns;
        if (brand.logo) {
            columns = [
                {image: brand.logo, fit: [170, 52], width: 180},
                {width: "*", stack: header ?? details(true), alignment: "right", fontSize: 8.5, color: MUTED},
            ];
        } else if (header) {
            columns = [{width: "*", stack: header, fontSize: 11, color}];
        } else {
            columns = [
                {width: "*", text: brand.name ?? "", fontSize: 17, bold: true, color},
                {width: "*", stack: details(false), alignment: "right", fontSize: 8.5, color: MUTED},
            ];
        }
        return [{columns, columnGap: 16}, rule(2, color, 10)];
    },

    // HTML -> pdfmake content in the brand colour, after removing what must not reach the PDF
    toContent: (html, color = DEFAULT_BRAND_COLOR) => {
        const container = window.document.createElement("div");
        container.innerHTML = html;
        container.querySelectorAll("script, style, iframe, object, embed, link, meta").forEach((node) => node.remove());
        container.querySelectorAll("img").forEach((image) => {
            if (!EMBEDDABLE_IMAGE.test(image.getAttribute("src") ?? "")) image.remove();
        });
        const content = htmlToPdfmake(container.innerHTML, {
            window,
            tableAutoSize: true,
            removeExtraBlanks: true,
            defaultStyles: {
                h1: {fontSize: 18, bold: true, color, marginBottom: 6},
                h2: {fontSize: 15, bold: true, color, marginBottom: 5},
                h3: {fontSize: 12, bold: true, color, margin: [0, 6, 0, 4]},
                h4: {fontSize: 11.5, bold: true, color, marginBottom: 4},
                h5: {fontSize: 11, bold: true, marginBottom: 3},
                h6: {fontSize: 10.5, bold: true, marginBottom: 3},
                a: {color, decoration: "underline"},
                p: {margin: [0, 2, 0, 7]},
                table: {fontSize: 9, marginBottom: 10},
                th: {bold: true, fillColor: color, color: "#FFFFFF"},
            },
        });
        pdfHelper.styleTables(content);
        // Plain text comes back as one node, not a list; header, footer and stack need a list
        return Array.isArray(content) ? content : [content];
    },

    // Every table without a layout of its own (a template can set one with data-pdfmake) gets ours
    styleTables: (node) => {
        if (Array.isArray(node)) return node.forEach(pdfHelper.styleTables);
        if (!_.isPlainObject(node)) return;
        if (node.table) {
            node.layout ??= TABLE_LAYOUT;
            node.table.dontBreakRows = true;
            pdfHelper.fullWidth(node.table);
        }
        Object.values(node).forEach(pdfHelper.styleTables);
    },

    // A table sized only by its content fills the page width: its column with the longest text takes the rest
    fullWidth: (table) => {
        const columns = table.body[0]?.length ?? 0;
        if (!columns || (table.widths && !table.widths.every((width) => width === "auto"))) return;
        const textLength = (cell) => (typeof cell?.text === "string" ? cell.text.length : 0);
        const longest = _.maxBy(_.range(columns), (column) => _.max(table.body.map((row) => textLength(row[column]))));
        table.widths = _.range(columns).map((column) => (column === longest ? "*" : "auto"));
    },
};

export default pdfHelper;
