import Joi from "joi";
import common from "./common.validation.js";

const dashboardValidation = {
    get: Joi.object({
        ...common.period,
        programId: common.id,
    }),
};

export default dashboardValidation;
