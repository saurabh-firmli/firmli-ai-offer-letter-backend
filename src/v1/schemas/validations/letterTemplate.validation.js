import Joi from "joi";
import common from "./common.validation.js";
import {LETTER_TEMPLATE_STATUSES, LETTER_TYPES} from "../../constants/letter-template.constants.js";

const fields = {
    name: Joi.string().trim().max(150),
    letterType: Joi.string().valid(...LETTER_TYPES),
    subject: common.optionalText(255),
    referencePrefix: Joi.string()
        .trim()
        .uppercase()
        .pattern(/^[A-Z0-9-]{1,10}$/)
        .messages({"string.pattern.base": "{{#label}} must be 1 to 10 letters, digits or dashes"}),
    body: Joi.string().trim().max(200000),
    signatoryName: common.optionalText(150),
    signatoryTitle: common.optionalText(150),
    headerHtml: common.optionalText(20000),
    footerHtml: common.optionalText(20000),
    status: Joi.string().valid(...LETTER_TEMPLATE_STATUSES),
};

const letterTemplateValidation = {
    create: common.createSchema({
        ...fields,
        name: fields.name.required(),
        letterType: fields.letterType.required(),
        body: fields.body.required(),
    }),

    update: common.updateSchema(fields),

    list: Joi.object({
        letterType: Joi.string().valid(...LETTER_TYPES),
        status: Joi.string().valid(...LETTER_TEMPLATE_STATUSES),
        search: common.searchText,
    }),
};

export default letterTemplateValidation;
