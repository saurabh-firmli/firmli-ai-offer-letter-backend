import databaseModel from "../utils/database.util.js";
import {ApiError} from "../utils/ApiError.js";
import {HTTP_RESPONSES} from "../constants/http-response-messages.constants.js";
import {
    EMAIL_TEMPLATED_FIELDS,
    EMAIL_TYPE_LABELS,
    EMAIL_TYPES_WITH_LETTER,
    PROGRAM_EMAIL_TEMPLATE_FIELDS,
} from "../constants/email-template.constants.js";
import dbHelper from "../helpers/db.helper.js";
import templateHelper from "../helpers/template.helper.js";

const NOT_FOUND = "Email template not found";
const DUPLICATE_NAME = "An email template with this name already exists";
const IN_USE = "Template is used by programs; pick another template on those programs first";
const TYPE_LOCKED = "Template is used by programs, so its email type cannot change";
const NO_LETTER = "Only Conditional Offer, Rejection and Manual Review emails have a PDF letter to attach";

// The program columns that point at an email template
const PROGRAM_COLUMNS = ["offer_email_template_id", "rejection_email_template_id"];

// The list leaves out the body: it can be large, and tables and dropdowns don't need it
const SUMMARY_COLUMNS = `
    id, tenant_id AS tenantId, name, email_type AS emailType, subject, cc, bcc,
    attach_pdf_letter AS attachPdfLetter, status, created_at AS createdAt, updated_at AS updatedAt`;

// Every method works inside one tenant (tenantId comes from req.user)
const emailTemplateService = {
    list: async ({emailType, status, search}, tenantId) => {
        const conditions = ["tenant_id = :tenantId", "deleted_at IS NULL"];
        if (emailType) conditions.push("email_type = :emailType");
        if (status) conditions.push("status = :status");
        if (search) conditions.push("(name LIKE :search OR subject LIKE :search)");

        const rows = await dbHelper.select(
            `SELECT ${SUMMARY_COLUMNS} FROM email_templates WHERE ${conditions.join(" AND ")} ORDER BY name`,
            {tenantId, emailType, status, search: search && dbHelper.likePattern(search)}
        );
        return rows.map(emailTemplateService.toResponse);
    },

    getById: async (id, tenantId) => {
        const row = await dbHelper.selectOneOrFail(
            `SELECT ${SUMMARY_COLUMNS}, body
             FROM email_templates
             WHERE id = :id AND tenant_id = :tenantId AND deleted_at IS NULL`,
            {id, tenantId},
            NOT_FOUND
        );
        return emailTemplateService.toResponse(row);
    },

    // The PDF letter is attached by default when the type has one
    create: async (values, tenantId) => {
        const columns = {attachPdfLetter: EMAIL_TYPES_WITH_LETTER.includes(values.emailType), ...dbHelper.emptyToNull(values)};
        emailTemplateService.assertAttachmentAllowed(columns);
        await templateHelper.assertKnownVariables(columns, EMAIL_TEMPLATED_FIELDS);

        const template = await dbHelper.saveOrConflict(
            () => databaseModel.emailTemplate.create({...columns, tenantId}),
            DUPLICATE_NAME
        );
        return emailTemplateService.getById(template.id, tenantId);
    },

    // Rules are checked on the template as it will be after the change
    update: async (id, values, tenantId) => {
        const current = await emailTemplateService.getById(id, tenantId);
        const columns = dbHelper.emptyToNull(values);
        emailTemplateService.assertAttachmentAllowed({...current, ...columns});
        await templateHelper.assertKnownVariables(columns, EMAIL_TEMPLATED_FIELDS);
        if (columns.emailType && columns.emailType !== current.emailType) {
            if (await templateHelper.isUsedByPrograms(id, PROGRAM_COLUMNS)) throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, TYPE_LOCKED);
        }

        await dbHelper.saveOrConflict(
            () => databaseModel.emailTemplate.update(columns, {where: {id, tenantId}}),
            DUPLICATE_NAME
        );
        return emailTemplateService.getById(id, tenantId);
    },

    remove: async (id, tenantId) => {
        await emailTemplateService.getById(id, tenantId);
        if (await templateHelper.isUsedByPrograms(id, PROGRAM_COLUMNS)) throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, IN_USE);
        await databaseModel.emailTemplate.destroy({where: {id, tenantId}});
    },

    // For program create / update: a conditional offer email in offerEmailTemplateId, a rejection email in rejectionEmailTemplateId
    assertProgramTemplates: (values, tenantId) =>
        templateHelper.assertProgramTemplates(values, tenantId, {
            table: "email_templates",
            typeColumn: "email_type",
            fieldsByType: PROGRAM_EMAIL_TEMPLATE_FIELDS,
            typeLabels: EMAIL_TYPE_LABELS,
        }),

    assertAttachmentAllowed: ({emailType, attachPdfLetter}) => {
        if (attachPdfLetter && !EMAIL_TYPES_WITH_LETTER.includes(emailType)) {
            throw ApiError.validation({attachPdfLetter: NO_LETTER});
        }
    },

    toResponse: (row) => ({...row, attachPdfLetter: Boolean(row.attachPdfLetter)}),
};

export default emailTemplateService;
