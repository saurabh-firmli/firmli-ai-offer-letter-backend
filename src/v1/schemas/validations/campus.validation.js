import Joi from "joi";
import common from "./common.validation.js";

const fields = {
    name: Joi.string().trim().max(150),
    cityId: common.id,
};

const campusValidation = {
    create: common.createSchema({
        name: fields.name.required(),
        cityId: fields.cityId.required(),
    }),

    update: common.updateSchema(fields),

    list: Joi.object({search: common.searchText}),
};

export default campusValidation;
