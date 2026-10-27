import Joi from "joi";
import common from "./common.validation.js";
import {AI_OPERATIONS, AI_USAGE_STATUSES} from "../../constants/aiUsage.constants.js";

const filters = {
    ...common.period,
    operation: Joi.string().valid(...AI_OPERATIONS),
    modelId: common.id,
    applicationId: common.id,
    status: Joi.string().valid(...Object.values(AI_USAGE_STATUSES)),
};

const aiUsageValidation = {
    list: Joi.object({...common.pagination, ...filters}),

    summary: Joi.object(filters),
};

export default aiUsageValidation;
