import Joi from "joi";
import common from "./common.validation.js";
import {STUDENT_EMAIL_STATUS_LABELS} from "../../constants/communication.constants.js";
import {EMAIL_TYPES} from "../../constants/email-template.constants.js";

const communicationValidation = {
    list: Joi.object({
        ...common.pagination,
        status: Joi.string().valid(...Object.keys(STUDENT_EMAIL_STATUS_LABELS)),
        emailType: Joi.string().valid(...EMAIL_TYPES),
        applicationId: common.id,
        search: common.searchText,
    }),

    sendLetter: Joi.object({
        templateId: common.id,
    }),
};

export default communicationValidation;
