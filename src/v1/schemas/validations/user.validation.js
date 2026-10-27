import Joi from "joi";
import common from "./common.validation.js";
import {USER_STATUSES} from "../../constants/user.constants.js";

const fields = {
    name: Joi.string().trim().max(150),
    email: common.email,
    password: common.newPassword,
    roleId: common.id,
    status: Joi.string().valid(...Object.values(USER_STATUSES)),
};

const userValidation = {
    create: common.createSchema({
        name: fields.name.required(),
        email: fields.email.required(),
        password: fields.password.required(),
        roleId: fields.roleId.required(),
        status: fields.status,
    }),

    update: common.updateSchema(fields),

    sendCredentials: Joi.object({password: Joi.string().max(72).required()}),

    list: Joi.object({
        status: fields.status,
        search: common.searchText,
    }),
};

export default userValidation;
