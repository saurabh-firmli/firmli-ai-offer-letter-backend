import Joi from "joi";
import common from "./common.validation.js";
import {CRITERION_OVERRIDE_RESULTS, REVIEW_PRIORITIES, REVIEW_STATUS_LABELS} from "../../constants/review.constants.js";
import {DECISION_OUTCOMES} from "../../constants/application.constants.js";

const reason = Joi.string().trim().max(2000);

const manualReviewValidation = {
    list: Joi.object({
        ...common.pagination,
        status: Joi.string().valid(...Object.keys(REVIEW_STATUS_LABELS)),
        priority: Joi.string().valid(...REVIEW_PRIORITIES),
        reviewerId: common.id,
        mine: Joi.boolean(),
        programId: common.id,
        search: common.searchText,
    }),

    assign: Joi.object({
        reviewerId: common.id.required(),
        priority: Joi.string().valid(...REVIEW_PRIORITIES),
        note: common.optionalText(2000),
    }),

    requestDocuments: Joi.object({
        documentTypeIds: common.idList.min(1).required(),
        message: common.optionalText(2000),
    }),

    returnForReassessment: Joi.object({
        note: common.optionalText(2000),
    }),

    decision: Joi.object({
        outcome: Joi.string().valid(...DECISION_OUTCOMES).required(),
        reason: reason.required(),
    }),

    criterionParams: Joi.object({
        id: common.id.required(),
        criterionId: common.id.required(),
    }),

    override: Joi.object({
        result: Joi.string().valid(...CRITERION_OVERRIDE_RESULTS).allow(null).required(),
        note: Joi.when("result", {is: null, then: Joi.any().strip(), otherwise: reason.required()}),
    }),
};

export default manualReviewValidation;
