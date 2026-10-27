import Joi from "joi";
import common from "./common.validation.js";
import {PROGRAM_STATUSES, STUDY_MODES} from "../../constants/program.constants.js";

const fields = {
    name: Joi.string().trim().max(150),
    code: Joi.string().trim().max(50),
    awardLevel: common.optionalText(100),
    campusId: common.id.messages({"number.base": "Select a campus"}),
    eligibilitySetId: common.optionalId,
    duration: Joi.string()
        .trim()
        .max(50)
        .messages({"string.base": "Duration is required", "string.empty": "Duration is required"}),
    studyMode: Joi.string().valid(...STUDY_MODES),
    applicationDeadline: common.dateOnly,
    status: Joi.string().valid(...PROGRAM_STATUSES),
    description: common.optionalText(5000),

    conditionalOfferTemplateId: common.optionalId,
    rejectionTemplateId: common.optionalId,
    manualReviewTemplateId: common.optionalId,
    offerEmailTemplateId: common.optionalId,
    rejectionEmailTemplateId: common.optionalId,
};

const programValidation = {
    create: common.createSchema({
        ...fields,
        name: fields.name.required(),
        code: fields.code.required(),
        campusId: fields.campusId.required().messages({"any.required": "Select a campus"}),
        duration: fields.duration.required().messages({"any.required": "Duration is required"}),
    }),

    update: common.updateSchema(fields),

    list: Joi.object({
        ...common.pagination,
        status: Joi.string().valid(...PROGRAM_STATUSES),
        studyMode: Joi.string().valid(...STUDY_MODES),
        campusId: common.id,
        eligibilitySetId: common.id,
        search: common.searchText,
    }),
};

export default programValidation;
