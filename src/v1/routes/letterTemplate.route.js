import express from "express";
import letterTemplateController from "../controllers/letterTemplate.controller.js";
import validate from "../middlewares/validate.middleware.js";
import commonValidation from "../schemas/validations/common.validation.js";
import letterTemplateValidation from "../schemas/validations/letterTemplate.validation.js";
import letterValidation from "../schemas/validations/letter.validation.js";
import letterController from "../controllers/letter.controller.js";

const letterTemplateRouter = express.Router();

// Before /:id, so "variables" is not read as an id
letterTemplateRouter.get("/variables", letterTemplateController.variables);
letterTemplateRouter.get("/", validate(letterTemplateValidation.list, "query"), letterTemplateController.list);
letterTemplateRouter.post("/", validate(letterTemplateValidation.create), letterTemplateController.create);
letterTemplateRouter.get("/:id", validate(commonValidation.idParam, "params"), letterTemplateController.getById);
// The template filled with one application's data (?applicationId=), nothing saved
letterTemplateRouter.get(
    "/:id/preview",
    validate(commonValidation.idParam, "params"),
    validate(letterValidation.preview, "query"),
    letterController.preview
);
// The same as a PDF, with the letterhead, logo and brand colour (application/pdf, not JSON)
letterTemplateRouter.get(
    "/:id/preview-pdf",
    validate(commonValidation.idParam, "params"),
    validate(letterValidation.preview, "query"),
    letterController.previewPdf
);
letterTemplateRouter.patch(
    "/:id",
    validate(commonValidation.idParam, "params"),
    validate(letterTemplateValidation.update),
    letterTemplateController.update
);
letterTemplateRouter.delete("/:id", validate(commonValidation.idParam, "params"), letterTemplateController.remove);

export default letterTemplateRouter;
