import Joi from "joi";
import common from "./common.validation.js";
import {DATA_TYPES, OPERATORS} from "../../constants/eligibility.constants.js";

const setFields = {
    name: Joi.string().trim().max(150),
    description: common.optionalText(5000),
};

const criterionFields = {
    name: Joi.string().trim().max(150),
    categoryId: common.id,
    description: common.optionalText(5000),
    dataType: Joi.string().valid(...DATA_TYPES),
    operator: Joi.string().valid(...OPERATORS),
    unit: common.optionalText(50),
    requiredValue: Joi.string().trim().max(255),
    evidenceInstructions: common.optionalText(5000),
    rejectionReason: common.optionalText(255),
    isMandatory: Joi.boolean(),
    effectiveDate: common.dateOnly,
    expiryDate: common.dateOnly,
    documentTypeIds: common.idList,
};

const documentRequirementFields = {
    documentTypeId: common.id,
    customLabel: common.optionalText(150),
    instructions: common.optionalText(500),
    isRequired: Joi.boolean(),
};

const eligibilityValidation = {
    createSet: common.createSchema({...setFields, name: setFields.name.required()}),

    updateSet: common.updateSchema(setFields),

    listSets: Joi.object({search: common.searchText}),

    assignPrograms: Joi.object({programIds: common.idList.required()}),

    copyFrom: Joi.object({versionId: common.id.required()}),

    createCriterion: common.createSchema({
        ...criterionFields,
        name: criterionFields.name.required(),
        categoryId: criterionFields.categoryId.required(),
        dataType: criterionFields.dataType.required(),
        operator: criterionFields.operator.required(),
        requiredValue: criterionFields.requiredValue.required(),
        isMandatory: criterionFields.isMandatory.default(true),
        documentTypeIds: criterionFields.documentTypeIds.default([]),
    }),

    updateCriterion: common.updateSchema(criterionFields),

    reorderCriteria: Joi.object({criterionIds: common.idList.min(1).required()}),

    createDocumentRequirement: common.createSchema({
        ...documentRequirementFields,
        documentTypeId: documentRequirementFields.documentTypeId.required(),
        isRequired: documentRequirementFields.isRequired.default(true),
    }),

    updateDocumentRequirement: common.updateSchema(documentRequirementFields),
};

export default eligibilityValidation;
