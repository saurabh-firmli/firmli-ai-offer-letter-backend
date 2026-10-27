import express from "express";
import eligibilityController from "../controllers/eligibility.controller.js";
import validate from "../middlewares/validate.middleware.js";
import commonValidation from "../schemas/validations/common.validation.js";
import eligibilityValidation from "../schemas/validations/eligibility.validation.js";

const byId = validate(commonValidation.idParam, "params");

// Mounted at /v1/eligibility. Sets are reused by many programs; criteria and documents live in a set's versions.
const eligibilityRouter = express.Router();

eligibilityRouter.get("/options", eligibilityController.options);

eligibilityRouter.get("/sets", validate(eligibilityValidation.listSets, "query"), eligibilityController.listSets);
eligibilityRouter.post("/sets", validate(eligibilityValidation.createSet), eligibilityController.createSet);
eligibilityRouter.get("/sets/:id", byId, eligibilityController.getSet);
eligibilityRouter.patch("/sets/:id", byId, validate(eligibilityValidation.updateSet), eligibilityController.updateSet);
eligibilityRouter.delete("/sets/:id", byId, eligibilityController.removeSet);
eligibilityRouter.put("/sets/:id/programs", byId, validate(eligibilityValidation.assignPrograms), eligibilityController.assignPrograms);
eligibilityRouter.post("/sets/:id/versions", byId, eligibilityController.createVersion);

eligibilityRouter.get("/versions/:id", byId, eligibilityController.getVersion);
eligibilityRouter.delete("/versions/:id", byId, eligibilityController.removeVersion);
eligibilityRouter.post("/versions/:id/publish", byId, eligibilityController.publishVersion);
eligibilityRouter.post("/versions/:id/copy-from", byId, validate(eligibilityValidation.copyFrom), eligibilityController.copyFromVersion);
eligibilityRouter.post("/versions/:id/criteria", byId, validate(eligibilityValidation.createCriterion), eligibilityController.createCriterion);
eligibilityRouter.put("/versions/:id/criteria/order", byId, validate(eligibilityValidation.reorderCriteria), eligibilityController.reorderCriteria);
eligibilityRouter.post("/versions/:id/documents", byId, validate(eligibilityValidation.createDocumentRequirement), eligibilityController.createDocumentRequirement);

eligibilityRouter.patch("/criteria/:id", byId, validate(eligibilityValidation.updateCriterion), eligibilityController.updateCriterion);
eligibilityRouter.delete("/criteria/:id", byId, eligibilityController.removeCriterion);

eligibilityRouter.patch("/documents/:id", byId, validate(eligibilityValidation.updateDocumentRequirement), eligibilityController.updateDocumentRequirement);
eligibilityRouter.delete("/documents/:id", byId, eligibilityController.removeDocumentRequirement);

export default eligibilityRouter;
