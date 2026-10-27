import Joi from "joi";
import common from "./common.validation.js";

const password = Joi.string().max(72);
const resetToken = Joi.string().trim().max(100).required();

const authValidation = {
    login: Joi.object({
        email: common.email.required(),
        password: password.required(),
    }),

    updateMe: Joi.object({
        name: Joi.string().trim().max(150).required(),
    }),

    forgotPassword: Joi.object({
        email: common.email.required(),
    }),

    verifyResetToken: Joi.object({
        token: resetToken,
    }),

    resetPassword: Joi.object({
        token: resetToken,
        password: common.newPassword.required(),
    }),

    changePassword: Joi.object({
        currentPassword: password.required(),
        newPassword: common.newPassword
            .invalid(Joi.ref("currentPassword"))
            .required()
            .messages({"any.invalid": "The new password must be different from the current one"}),
    }),
};

export default authValidation;
