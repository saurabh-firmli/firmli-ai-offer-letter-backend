import Joi from "joi";
import common from "./common.validation.js";
import {EMAIL_TEMPLATE_STATUSES, EMAIL_TYPES, MAX_CC_EMAILS} from "../../constants/email-template.constants.js";

const isEmail = (value) => !Joi.string().email().validate(value).error;

const emailList = Joi.string()
    .max(1000)
    .custom((value, helpers) => {
        const emails = value.split(/[,;]/).map((email) => email.trim().toLowerCase()).filter(Boolean);
        const invalid = emails.filter((email) => !isEmail(email));
        if (invalid.length) return helpers.error("emailList.invalid", {invalid: invalid.join(", ")});
        if (emails.length > MAX_CC_EMAILS) return helpers.error("emailList.max", {max: MAX_CC_EMAILS});
        return emails.join(", ");
    })
    .messages({
        "emailList.invalid": "{{#label}} has invalid emails: {#invalid}",
        "emailList.max": "{{#label}} can have at most {#max} emails",
    })
    .allow(null, "");

const fields = {
    name: Joi.string().trim().max(150),
    emailType: Joi.string().valid(...EMAIL_TYPES),
    subject: common.optionalText(255),
    cc: emailList,
    bcc: emailList,
    body: Joi.string().trim().max(200000),
    attachPdfLetter: Joi.boolean(),
    status: Joi.string().valid(...EMAIL_TEMPLATE_STATUSES),
};

const emailTemplateValidation = {
    create: common.createSchema({
        ...fields,
        name: fields.name.required(),
        emailType: fields.emailType.required(),
        body: fields.body.required(),
    }),

    update: common.updateSchema(fields),

    list: Joi.object({
        emailType: Joi.string().valid(...EMAIL_TYPES),
        status: Joi.string().valid(...EMAIL_TEMPLATE_STATUSES),
        search: common.searchText,
    }),
};

export default emailTemplateValidation;
