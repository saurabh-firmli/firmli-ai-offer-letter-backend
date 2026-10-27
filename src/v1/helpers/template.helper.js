import _ from "lodash";
import {ApiError} from "../utils/ApiError.js";
import {VARIABLE_PATTERN} from "../constants/letter-template.constants.js";
import dbHelper from "./db.helper.js";

// An opening or closing HTML tag such as <p>, </b> or <br/>
const HTML_TAG = /<\/?[a-z][a-z0-9]*(\s[^>]*)?\/?>/i;

// What letter templates and email templates share: {{variables}} and how programs point at them
const templateHelper = {
    // Shared by all tenants: the {{variables}} for the "Insert variable" dropdown
    variables: () =>
        dbHelper.select("SELECT name AS `key`, label FROM letter_variables WHERE deleted_at IS NULL ORDER BY sort_order, label"),

    // Any {{name}} not in letter_variables is refused, so nothing goes out with a blank placeholder
    assertKnownVariables: async (values, templatedFields) => {
        const fieldsToCheck = templatedFields.filter((field) => values[field]);
        if (fieldsToCheck.length === 0) return;

        const known = new Set(_.map(await templateHelper.variables(), "key"));
        const errors = {};
        for (const field of fieldsToCheck) {
            const unknown = templateHelper.variablesIn(values[field]).filter((name) => !known.has(name));
            if (unknown.length) errors[field] = `${field} uses unknown variables: ${unknown.join(", ")}`;
        }
        if (!_.isEmpty(errors)) throw ApiError.validation(errors);
    },

    /**
     * A template typed as plain text (no HTML tags) as HTML: each line kept, a blank line starts a new
     * paragraph, special characters escaped. HTML templates are returned as they are.
     * @example templateHelper.toHtml("Dear {{student_full_name}},\n\nWelcome.") // "<p>Dear {{student_full_name}},</p><p>Welcome.</p>"
     */
    toHtml: (text) => {
        if (HTML_TAG.test(text)) return text;
        return text
            .trim()
            .split(/\r?\n\s*\r?\n/)
            .map((paragraph) => `<p>${_.escape(paragraph.trim()).replace(/\r?\n/g, "<br>")}</p>`)
            .join("");
    },

    // "Dear {{ student_full_name }}, {{program_name}}" -> ["student_full_name", "program_name"]
    variablesIn: (text) => _.uniq([...text.matchAll(VARIABLE_PATTERN)].map(([, name]) => name)),

    /**
     * For program create / update: each template id sent in values must be a live template of this
     * tenant with the type its field expects (a rejection template in rejectionTemplateId, ...).
     * table and typeColumn are constants from our own code, never user input.
     */
    assertProgramTemplates: async (values, tenantId, {table, typeColumn, fieldsByType, typeLabels}) => {
        const errors = {};
        for (const [type, field] of Object.entries(fieldsByType)) {
            if (!values[field]) continue;

            const template = await dbHelper.selectOne(
                `SELECT id FROM ${table}
                 WHERE id = :id AND tenant_id = :tenantId AND ${typeColumn} = :type AND deleted_at IS NULL`,
                {id: values[field], tenantId, type}
            );
            if (!template) errors[field] = `Pick a ${typeLabels[type]} template`;
        }
        if (!_.isEmpty(errors)) throw ApiError.validation(errors);
    },

    // True when a live program uses the template in any of these program columns (constants, never user input)
    isUsedByPrograms: async (id, programColumns) => {
        const program = await dbHelper.selectOne(
            `SELECT id FROM programs
             WHERE (${programColumns.map((column) => `${column} = :id`).join(" OR ")}) AND deleted_at IS NULL
             LIMIT 1`,
            {id}
        );
        return Boolean(program);
    },
};

export default templateHelper;
