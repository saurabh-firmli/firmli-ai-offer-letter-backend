import _ from "lodash";
import databaseModel from "../utils/database.util.js";
import {ApiError} from "../utils/ApiError.js";
import {HTTP_RESPONSES} from "../constants/http-response-messages.constants.js";
import {DATA_TYPE_LABELS, OPERATOR_LABELS, OPERATORS_BY_DATA_TYPE} from "../constants/eligibility.constants.js";
import commonValidation from "../schemas/validations/common.validation.js";
import dbHelper from "../helpers/db.helper.js";
import responseHelper from "../helpers/response.helper.js";
import eligibilityVersionService, {NOT_DRAFT} from "./eligibilityVersion.service.js";

const CRITERION_NOT_FOUND = "Criterion not found";
const DOCUMENT_NOT_FOUND = "Document requirement not found";
const DUPLICATE_DOCUMENT = "This document type is already in the list";

// The value format each data type needs; "between" and "one_of" take a comma separated list
const VALUE_CHECKS = {
    text: {isValid: (value) => value.length > 0, message: "Enter a value"},
    number: {isValid: (value) => /^-?\d+(\.\d+)?$/.test(value), message: "Enter a number, e.g. 3.0"},
    boolean: {isValid: (value) => ["true", "false"].includes(value), message: "Enter true or false"},
    date: {isValid: commonValidation.isDateOnly, message: "Enter a date as YYYY-MM-DD"},
};

// Criteria and document requirements live in a version; only a draft version can change
const eligibilityCriteriaService = {
    // Everything the criterion and document forms need for their dropdowns
    options: async () => {
        const [categories, documentTypes] = await Promise.all([
            dbHelper.select("SELECT id, code, label FROM eligibility_categories WHERE deleted_at IS NULL ORDER BY sort_order, label"),
            dbHelper.select("SELECT id, code, label FROM document_types WHERE deleted_at IS NULL ORDER BY sort_order, label"),
        ]);
        return {
            categories,
            documentTypes,
            dataTypes: responseHelper.labelOptions(DATA_TYPE_LABELS),
            operators: responseHelper.labelOptions(OPERATOR_LABELS),
            operatorsByDataType: OPERATORS_BY_DATA_TYPE,
        };
    },

    createCriterion: async (versionId, values, tenantId) => {
        await eligibilityVersionService.findDraft(versionId, tenantId);
        const {documentTypeIds, ...columns} = dbHelper.emptyToNull(values);
        await eligibilityCriteriaService.assertCriterionValid(columns, documentTypeIds);

        const sortOrder = await eligibilityCriteriaService.nextSortOrder("eligibility_criteria", versionId);
        const criterion = await databaseModel.sequelize.transaction(async (transaction) => {
            const created = await databaseModel.eligibilityCriterion.create({...columns, versionId, sortOrder}, {transaction});
            await eligibilityCriteriaService.setDocuments(created.id, documentTypeIds, transaction);
            return created;
        });
        return eligibilityCriteriaService.getCriterion(criterion.id, versionId);
    },

    // Rules are checked on the criterion as it will be after the change
    updateCriterion: async (id, values, tenantId) => {
        const current = await eligibilityCriteriaService.findCriterion(id, tenantId);
        const {documentTypeIds, ...columns} = dbHelper.emptyToNull(values);
        await eligibilityCriteriaService.assertCriterionValid({...current, ...columns}, documentTypeIds);

        await databaseModel.sequelize.transaction(async (transaction) => {
            if (!_.isEmpty(columns)) await databaseModel.eligibilityCriterion.update(columns, {where: {id}, transaction});
            if (documentTypeIds) await eligibilityCriteriaService.setDocuments(id, documentTypeIds, transaction);
        });
        return eligibilityCriteriaService.getCriterion(id, current.versionId);
    },

    // Soft deletes the criterion with the documents ticked for it
    removeCriterion: async (id, tenantId) => {
        await eligibilityCriteriaService.findCriterion(id, tenantId);
        await databaseModel.sequelize.transaction(async (transaction) => {
            await databaseModel.eligibilityCriterionDocument.destroy({where: {criterionId: id}, transaction});
            await databaseModel.eligibilityCriterion.destroy({where: {id}, transaction});
        });
    },

    // criterionIds must list every criterion of the version, in the new order
    reorderCriteria: async (versionId, criterionIds, tenantId) => {
        await eligibilityVersionService.findDraft(versionId, tenantId);
        const existing = await dbHelper.select(
            "SELECT id FROM eligibility_criteria WHERE version_id = :versionId AND deleted_at IS NULL",
            {versionId}
        );
        if (_.xor(_.map(existing, "id"), criterionIds).length) {
            throw ApiError.validation({criterionIds: "Send every criterion of this version, each once"});
        }

        await databaseModel.sequelize.transaction(async (transaction) => {
            for (const [index, id] of criterionIds.entries()) {
                await databaseModel.eligibilityCriterion.update({sortOrder: index + 1}, {where: {id}, transaction});
            }
        });
        return eligibilityVersionService.criteriaOf(versionId);
    },

    createDocumentRequirement: async (versionId, values, tenantId) => {
        await eligibilityVersionService.findDraft(versionId, tenantId);
        await eligibilityCriteriaService.assertDocumentTypesExist([values.documentTypeId], "documentTypeId");

        const sortOrder = await eligibilityCriteriaService.nextSortOrder("eligibility_document_requirements", versionId);
        const document = await dbHelper.saveOrConflict(
            () => databaseModel.eligibilityDocumentRequirement.create({...dbHelper.emptyToNull(values), versionId, sortOrder}),
            DUPLICATE_DOCUMENT
        );
        return eligibilityCriteriaService.getDocumentRequirement(document.id, versionId);
    },

    updateDocumentRequirement: async (id, values, tenantId) => {
        const current = await eligibilityCriteriaService.findDocumentRequirement(id, tenantId);
        if (values.documentTypeId) await eligibilityCriteriaService.assertDocumentTypesExist([values.documentTypeId], "documentTypeId");

        await dbHelper.saveOrConflict(
            () => databaseModel.eligibilityDocumentRequirement.update(dbHelper.emptyToNull(values), {where: {id}}),
            DUPLICATE_DOCUMENT
        );
        return eligibilityCriteriaService.getDocumentRequirement(id, current.versionId);
    },

    removeDocumentRequirement: async (id, tenantId) => {
        await eligibilityCriteriaService.findDocumentRequirement(id, tenantId);
        await databaseModel.eligibilityDocumentRequirement.destroy({where: {id}});
    },

    getCriterion: async (id, versionId) => _.find(await eligibilityVersionService.criteriaOf(versionId), {id}),

    getDocumentRequirement: async (id, versionId) =>
        _.find(await eligibilityVersionService.documentRequirementsOf(versionId), {id}),

    // The criterion, if it belongs to this tenant and its version is still a draft
    findCriterion: (id, tenantId) =>
        eligibilityCriteriaService.findInDraft(
            `SELECT c.id, c.version_id AS versionId, c.category_id AS categoryId, c.data_type AS dataType, c.operator,
                    c.required_value AS requiredValue,
                    DATE_FORMAT(c.effective_date, '%Y-%m-%d') AS effectiveDate,
                    DATE_FORMAT(c.expiry_date, '%Y-%m-%d') AS expiryDate,
                    v.status AS versionStatus
             FROM eligibility_criteria c`,
            "c",
            {id, tenantId},
            CRITERION_NOT_FOUND
        ),

    findDocumentRequirement: (id, tenantId) =>
        eligibilityCriteriaService.findInDraft(
            "SELECT d.id, d.version_id AS versionId, v.status AS versionStatus FROM eligibility_document_requirements d",
            "d",
            {id, tenantId},
            DOCUMENT_NOT_FOUND
        ),

    // Runs "SELECT ... FROM <table> <alias>" for one live row of this tenant and refuses it unless its version is a draft
    findInDraft: async (selectFrom, alias, {id, tenantId}, notFoundMessage) => {
        const row = await dbHelper.selectOneOrFail(
            `${selectFrom}
             JOIN eligibility_set_versions v ON v.id = ${alias}.version_id
             JOIN eligibility_sets s ON s.id = v.eligibility_set_id
             WHERE ${alias}.id = :id AND s.tenant_id = :tenantId
               AND ${alias}.deleted_at IS NULL AND v.deleted_at IS NULL AND s.deleted_at IS NULL`,
            {id, tenantId},
            notFoundMessage
        );
        if (row.versionStatus !== "draft") throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, NOT_DRAFT);
        return _.omit(row, "versionStatus");
    },

    // Checks across fields that Joi cannot: operator vs data type, value format, dates, known lookups
    assertCriterionValid: async (criterion, documentTypeIds) => {
        const errors = {
            ...eligibilityCriteriaService.valueErrors(criterion),
            ...eligibilityCriteriaService.dateErrors(criterion),
        };
        if (!_.isEmpty(errors)) throw ApiError.validation(errors);

        const category = await dbHelper.selectOne(
            "SELECT id FROM eligibility_categories WHERE id = :categoryId AND deleted_at IS NULL",
            {categoryId: criterion.categoryId}
        );
        if (!category) throw ApiError.validation({categoryId: "Category not found"});
        await eligibilityCriteriaService.assertDocumentTypesExist(documentTypeIds, "documentTypeIds");
    },

    valueErrors: ({dataType, operator, requiredValue}) => {
        if (!OPERATORS_BY_DATA_TYPE[dataType].includes(operator)) {
            return {operator: `${OPERATOR_LABELS[operator]} cannot be used with ${DATA_TYPE_LABELS[dataType]}`};
        }

        const isList = operator === "between" || operator === "one_of";
        const values = isList ? requiredValue.split(",").map((value) => value.trim()) : [requiredValue];
        const check = VALUE_CHECKS[dataType];

        if (operator === "between" && values.length !== 2) return {requiredValue: "Enter two values: min,max"};
        if (!values.every(check.isValid)) return {requiredValue: isList ? `${check.message}, separated by commas` : check.message};
        if (operator === "between" && eligibilityCriteriaService.isAfter(values[0], values[1], dataType)) {
            return {requiredValue: "The first value must not be greater than the second"};
        }
        return {};
    },

    dateErrors: ({effectiveDate, expiryDate}) =>
        effectiveDate && expiryDate && expiryDate < effectiveDate
            ? {expiryDate: "Expiry date must be on or after the effective date"}
            : {},

    // Dates as YYYY-MM-DD compare correctly as strings
    isAfter: (a, b, dataType) => (dataType === "number" ? Number(a) > Number(b) : a > b),

    assertDocumentTypesExist: async (documentTypeIds, field) => {
        if (_.isEmpty(documentTypeIds)) return;
        const found = await dbHelper.select(
            "SELECT id FROM document_types WHERE id IN (:documentTypeIds) AND deleted_at IS NULL",
            {documentTypeIds}
        );
        if (found.length !== documentTypeIds.length) throw ApiError.validation({[field]: "Document type not found"});
    },

    // Replaces the documents the AI checks for a criterion (old ones soft deleted); undefined leaves them as they are
    setDocuments: async (criterionId, documentTypeIds, transaction) => {
        if (!documentTypeIds) return;
        await databaseModel.eligibilityCriterionDocument.destroy({where: {criterionId}, transaction});
        await databaseModel.eligibilityCriterionDocument.bulkCreate(
            documentTypeIds.map((documentTypeId) => ({criterionId, documentTypeId})),
            {transaction}
        );
    },

    // New rows go to the end of the list; table is a constant from this file, never user input
    nextSortOrder: async (table, versionId) => {
        const {maxOrder} = await dbHelper.selectOne(
            `SELECT MAX(sort_order) AS maxOrder FROM ${table} WHERE version_id = :versionId AND deleted_at IS NULL`,
            {versionId}
        );
        return (maxOrder ?? 0) + 1;
    },
};

export default eligibilityCriteriaService;
