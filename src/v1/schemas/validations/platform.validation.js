import Joi from "joi";
import common from "./common.validation.js";
import userValidation from "./user.validation.js";
import {TENANT_STATUS_LABELS} from "../../constants/tenant.constants.js";

const fields = {
    name: Joi.string().trim().max(150),
    code: Joi.string()
        .trim()
        .uppercase()
        .pattern(/^[A-Z0-9-]{2,20}$/)
        .messages({"string.pattern.base": "Code must be 2 to 20 letters, digits or dashes"})
        .allow(null, ""),
    contactEmail: common.email.allow(null, ""),
    status: Joi.string().valid(...Object.keys(TENANT_STATUS_LABELS)),
};

const platformValidation = {
    list: Joi.object({
        ...common.pagination,
        status: fields.status,
        search: common.searchText,
    }),

    create: common.createSchema({
        name: fields.name.required(),
        code: fields.code,
        contactEmail: fields.contactEmail,
        admin: Joi.object({
            name: Joi.string().trim().max(150).required(),
            email: common.email.required(),
            password: common.newPassword.required(),
        }).required(),
    }),

    update: common.updateSchema(fields),

    addUser: userValidation.create,

    userParams: Joi.object({id: common.id.required(), userId: common.id.required()}),

    sendCredentials: userValidation.sendCredentials,
};

export default platformValidation;
