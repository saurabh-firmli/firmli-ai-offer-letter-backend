import databaseModel from "../utils/database.util.js";
import {ApiError} from "../utils/ApiError.js";
import {HTTP_RESPONSES} from "../constants/http-response-messages.constants.js";
import {LETTER_TYPE_LABELS, PROGRAM_TEMPLATE_FIELDS, TEMPLATED_FIELDS} from "../constants/letter-template.constants.js";
import dbHelper from "../helpers/db.helper.js";
import templateHelper from "../helpers/template.helper.js";

const NOT_FOUND = "Letter template not found";
const DUPLICATE_NAME = "A letter template with this name already exists";
const IN_USE = "Template is used by programs; pick another template on those programs first";
const TYPE_LOCKED = "Template is used by programs, so its letter type cannot change";

// The program columns that point at a letter template
const PROGRAM_COLUMNS = ["conditional_offer_template_id", "rejection_template_id", "manual_review_template_id"];

// The list leaves out body / header / footer: they can be large, and tables and dropdowns don't need them
const SUMMARY_COLUMNS = `
    id, tenant_id AS tenantId, name, letter_type AS letterType, subject, reference_prefix AS referencePrefix,
    signatory_name AS signatoryName, signatory_title AS signatoryTitle, status,
    created_at AS createdAt, updated_at AS updatedAt`;

// Every method works inside one tenant (tenantId comes from req.user)
const letterTemplateService = {
    variables: () => templateHelper.variables(),

    list: ({letterType, status, search}, tenantId) => {
        const conditions = ["tenant_id = :tenantId", "deleted_at IS NULL"];
        if (letterType) conditions.push("letter_type = :letterType");
        if (status) conditions.push("status = :status");
        if (search) conditions.push("(name LIKE :search OR subject LIKE :search)");

        return dbHelper.select(
            `SELECT ${SUMMARY_COLUMNS} FROM letter_templates WHERE ${conditions.join(" AND ")} ORDER BY name`,
            {tenantId, letterType, status, search: search && dbHelper.likePattern(search)}
        );
    },

    getById: (id, tenantId) =>
        dbHelper.selectOneOrFail(
            `SELECT ${SUMMARY_COLUMNS}, body, header_html AS headerHtml, footer_html AS footerHtml
             FROM letter_templates
             WHERE id = :id AND tenant_id = :tenantId AND deleted_at IS NULL`,
            {id, tenantId},
            NOT_FOUND
        ),

    create: async (values, tenantId) => {
        await templateHelper.assertKnownVariables(values, TEMPLATED_FIELDS);
        const template = await dbHelper.saveOrConflict(
            () => databaseModel.letterTemplate.create({...dbHelper.emptyToNull(values), tenantId}),
            DUPLICATE_NAME
        );
        return letterTemplateService.getById(template.id, tenantId);
    },

    // Only this tenant's live row is updated; reading it back answers 404 when there was none
    update: async (id, values, tenantId) => {
        await templateHelper.assertKnownVariables(values, TEMPLATED_FIELDS);
        if (values.letterType) await letterTemplateService.assertTypeCanChange(id, values.letterType, tenantId);

        await dbHelper.saveOrConflict(
            () => databaseModel.letterTemplate.update(dbHelper.emptyToNull(values), {where: {id, tenantId}}),
            DUPLICATE_NAME
        );
        return letterTemplateService.getById(id, tenantId);
    },

    remove: async (id, tenantId) => {
        await letterTemplateService.getById(id, tenantId);
        if (await templateHelper.isUsedByPrograms(id, PROGRAM_COLUMNS)) throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, IN_USE);
        await databaseModel.letterTemplate.destroy({where: {id, tenantId}});
    },

    // For program create / update: a rejection letter template in rejectionTemplateId, ...
    assertProgramTemplates: (values, tenantId) =>
        templateHelper.assertProgramTemplates(values, tenantId, {
            table: "letter_templates",
            typeColumn: "letter_type",
            fieldsByType: PROGRAM_TEMPLATE_FIELDS,
            typeLabels: LETTER_TYPE_LABELS,
        }),

    // A program uses a template for one letter type, so a template in use keeps its type
    assertTypeCanChange: async (id, letterType, tenantId) => {
        const current = await letterTemplateService.getById(id, tenantId);
        if (letterType === current.letterType) return;
        if (await templateHelper.isUsedByPrograms(id, PROGRAM_COLUMNS)) throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, TYPE_LOCKED);
    },
};

export default letterTemplateService;
