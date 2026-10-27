import express from "express";
import applicationController from "../controllers/application.controller.js";
import validate from "../middlewares/validate.middleware.js";
import uploadFile from "../middlewares/upload.middleware.js";
import commonValidation from "../schemas/validations/common.validation.js";
import applicationValidation from "../schemas/validations/application.validation.js";
import letterController from "../controllers/letter.controller.js";
import communicationController from "../controllers/communication.controller.js";
import {authorize} from "../middlewares/auth.middleware.js";
import {MODULES} from "../constants/module.constants.js";

// Mounted behind authenticate + authorize(MODULES.APPLICATIONS): submit, upload, extract, notes and letters need create.
// The letters routes also need the Letters permission
const applicationRouter = express.Router();
const id = validate(commonValidation.idParam, "params");

applicationRouter.get("/options", applicationController.options);
applicationRouter.get("/", validate(applicationValidation.list, "query"), applicationController.list);
applicationRouter.post("/", validate(applicationValidation.create), applicationController.create);

applicationRouter.get("/documents/:id/download-url", id, applicationController.documentDownloadUrl);
applicationRouter.post("/documents/:id/extract", id, applicationController.extractDocument);
applicationRouter.get("/documents/:id/extraction", id, applicationController.documentExtraction);
applicationRouter.get("/assessments/:id", id, applicationController.assessment);
applicationRouter.delete("/documents/:id", id, applicationController.removeDocument);

applicationRouter.get("/:id", id, applicationController.getById);
applicationRouter.patch("/:id", id, validate(applicationValidation.update), applicationController.update);
applicationRouter.delete("/:id", id, applicationController.remove);
applicationRouter.post("/:id/submit", id, validate(applicationValidation.submit), applicationController.submit);
applicationRouter.post("/:id/assess", id, applicationController.assess);
applicationRouter.get("/:id/assessment", id, applicationController.latestAssessment);
applicationRouter.get("/:id/assessments", id, applicationController.assessmentHistory);
applicationRouter.put("/:id/officer", id, validate(applicationValidation.officer), applicationController.assignOfficer);
applicationRouter.put("/:id/outcome", id, validate(applicationValidation.outcome), applicationController.changeOutcome);
applicationRouter.post("/:id/documents", id, uploadFile, validate(applicationValidation.upload), applicationController.uploadDocument);
applicationRouter.get("/:id/activity", id, validate(applicationValidation.activity, "query"), applicationController.activity);
applicationRouter.get("/:id/letters", id, authorize(MODULES.LETTERS, "read"), letterController.listForApplication);
applicationRouter.post("/:id/letters", id, authorize(MODULES.LETTERS, "create"), letterController.generate);
applicationRouter.get("/:id/emails", id, authorize(MODULES.COMMUNICATIONS, "read"), communicationController.listForApplication);
applicationRouter.get("/:id/notes", id, applicationController.notes);
applicationRouter.post("/:id/notes", id, validate(applicationValidation.note), applicationController.addNote);

export default applicationRouter;
