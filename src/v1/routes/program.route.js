import express from "express";
import programController from "../controllers/program.controller.js";
import validate from "../middlewares/validate.middleware.js";
import commonValidation from "../schemas/validations/common.validation.js";
import programValidation from "../schemas/validations/program.validation.js";

const programRouter = express.Router();

programRouter.get("/", validate(programValidation.list, "query"), programController.list);
programRouter.post("/", validate(programValidation.create), programController.create);
programRouter.get("/:id", validate(commonValidation.idParam, "params"), programController.getById);
programRouter.patch("/:id", validate(commonValidation.idParam, "params"), validate(programValidation.update), programController.update);
programRouter.delete("/:id", validate(commonValidation.idParam, "params"), programController.remove);

export default programRouter;
