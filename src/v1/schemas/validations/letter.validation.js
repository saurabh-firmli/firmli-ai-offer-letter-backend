import Joi from "joi";
import common from "./common.validation.js";
import {LETTER_STATUS_LABELS} from "../../constants/letter.constants.js";
import {LETTER_TYPES} from "../../constants/letter-template.constants.js";

const letterValidation = {
    list: Joi.object({
        ...common.pagination,
        status: Joi.string().valid(...Object.keys(LETTER_STATUS_LABELS)),
        letterType: Joi.string().valid(...LETTER_TYPES),
        programId: common.id,
        search: common.searchText,
    }),

    downloadUrl: Joi.object({
        inline: Joi.boolean().default(false),
    }),

    approve: Joi.object({
        note: common.optionalText(2000),
    }),

    reject: Joi.object({
        note: Joi.string().trim().max(2000).required(),
    }),

    preview: Joi.object({
        applicationId: common.id.required(),
    }),
};

export default letterValidation;
