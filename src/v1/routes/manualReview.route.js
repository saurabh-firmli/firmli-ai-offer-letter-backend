import express from "express";
import manualReviewController from "../controllers/manualReview.controller.js";
import validate from "../middlewares/validate.middleware.js";
import commonValidation from "../schemas/validations/common.validation.js";
import manualReviewValidation from "../schemas/validations/manualReview.validation.js";
import applicationValidation from "../schemas/validations/application.validation.js";

// Mounted behind authenticate and authorize(MODULES.REVIEWS). The module has only read and update,
// so its POST actions (they change an existing case) need update
const manualReviewRouter = express.Router();
const id = validate(commonValidation.idParam, "params");

manualReviewRouter.get("/options", manualReviewController.options);
manualReviewRouter.get("/", validate(manualReviewValidation.list, "query"), manualReviewController.list);
manualReviewRouter.get("/:id", id, manualReviewController.getById);
manualReviewRouter.put("/:id/assignment", id, validate(manualReviewValidation.assign), manualReviewController.assign);
manualReviewRouter.post("/:id/notes", id, validate(applicationValidation.note), manualReviewController.addNote);
manualReviewRouter.post("/:id/decision", id, validate(manualReviewValidation.decision), manualReviewController.decide);
manualReviewRouter.put(
    "/:id/criteria/:criterionId",
    validate(manualReviewValidation.criterionParams, "params"),
    validate(manualReviewValidation.override),
    manualReviewController.overrideCriterion
);
manualReviewRouter.post("/:id/request-documents", id, validate(manualReviewValidation.requestDocuments), manualReviewController.requestDocuments);
manualReviewRouter.post(
    "/:id/return-for-reassessment",
    id,
    validate(manualReviewValidation.returnForReassessment),
    manualReviewController.returnForReassessment
);

export default manualReviewRouter;
