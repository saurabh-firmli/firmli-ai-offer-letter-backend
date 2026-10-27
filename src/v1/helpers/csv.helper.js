import _ from "lodash";

// A cell starting like a formula is shown as text, so a spreadsheet never runs it
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * CSV text for Excel and Google Sheets: a header row, then one row per item. columns = [{header, value: (row) => ...}].
 * Starts with a BOM so Excel reads UTF-8 (names like "José").
 *
 *   csvHelper.toCsv([{header: "Name", value: (row) => row.name}], rows)
 */
const csvHelper = {
    toCsv: (columns, rows) => csvHelper.header(columns) + csvHelper.rows(columns, rows),

    // The start of a CSV: the BOM and the header row. A long CSV then streams csvHelper.rows(...) batch by batch
    header: (columns) => `﻿${columns.map((column) => csvHelper.cell(column.header)).join(",")}\r\n`,

    rows: (columns, rows) => rows.map((row) => `${columns.map((column) => csvHelper.cell(column.value(row))).join(",")}\r\n`).join(""),

    cell: (value) => {
        if (_.isNil(value)) return "";
        let text = value instanceof Date ? value.toISOString() : String(value);
        if (FORMULA_START.test(text)) text = `'${text}`;
        return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    },
};

export default csvHelper;
