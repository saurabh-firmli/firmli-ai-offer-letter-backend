import Joi from "joi";
import common from "./common.validation.js";
import {PROGRAM_STATUSES} from "../../constants/program.constants.js";
import {LETTER_TEMPLATE_STATUSES, LETTER_TYPES} from "../../constants/letter-template.constants.js";
import {EMAIL_TEMPLATE_STATUSES, EMAIL_TYPES} from "../../constants/email-template.constants.js";
const dropdownValidation = {
    programs: Joi.object({
        status: Joi.string().valid(...PROGRAM_STATUSES),
        search: common.searchText,
        withEligibilitySet: Joi.boolean(),
    }),

    campuses: Joi.object({
        search: common.searchText,
    }),

    eligibilitySets: Joi.object({
        published: Joi.boolean(),
        search: common.searchText,
    }),

    letterTemplates: Joi.object({
        letterType: Joi.string().valid(...LETTER_TYPES),
        status: Joi.string().valid(...LETTER_TEMPLATE_STATUSES),
        search: common.searchText,
    }),

    users: Joi.object({
        role: Joi.string().max(50).pattern(/^[a-z_]+$/),
        assignable: Joi.boolean(),
        search: common.searchText,
    }),

    roles: Joi.object({}),

    emailTemplates: Joi.object({
        emailType: Joi.string().valid(...EMAIL_TYPES),
        status: Joi.string().valid(...EMAIL_TEMPLATE_STATUSES),
        search: common.searchText,
    }),
};

export default dropdownValidation;
