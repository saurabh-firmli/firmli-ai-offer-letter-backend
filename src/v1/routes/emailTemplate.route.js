import express from "express";
import emailTemplateController from "../controllers/emailTemplate.controller.js";
import letterTemplateController from "../controllers/letterTemplate.controller.js";
import validate from "../middlewares/validate.middleware.js";
import commonValidation from "../schemas/validations/common.validation.js";
import emailTemplateValidation from "../schemas/validations/emailTemplate.validation.js";

const byId = validate(commonValidation.idParam, "params");

const emailTemplateRouter = express.Router();

// The same {{variables}} as letter templates. Before /:id, so "variables" is not read as an id
emailTemplateRouter.get("/variables", letterTemplateController.variables);
emailTemplateRouter.get("/", validate(emailTemplateValidation.list, "query"), emailTemplateController.list);
emailTemplateRouter.post("/", validate(emailTemplateValidation.create), emailTemplateController.create);
emailTemplateRouter.get("/:id", byId, emailTemplateController.getById);
emailTemplateRouter.patch("/:id", byId, validate(emailTemplateValidation.update), emailTemplateController.update);
emailTemplateRouter.delete("/:id", byId, emailTemplateController.remove);

export default emailTemplateRouter;
