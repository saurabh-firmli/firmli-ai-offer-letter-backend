import Joi from "joi";

const actions = Joi.object({
    create: Joi.boolean().required(),
    read: Joi.boolean().required(),
    update: Joi.boolean().required(),
    delete: Joi.boolean().required(),
});

const roleValidation = {
    updatePermissions: Joi.object({
        permissions: Joi.object()
            .pattern(Joi.string().max(50), actions)
            .min(1)
            .required()
            .messages({"object.min": "Send at least one module"}),
    }).options({stripUnknown: true}),
};

export default roleValidation;
