import express from "express";
import campusController from "../controllers/campus.controller.js";
import validate from "../middlewares/validate.middleware.js";
import commonValidation from "../schemas/validations/common.validation.js";
import campusValidation from "../schemas/validations/campus.validation.js";

const campusRouter = express.Router();

campusRouter.get("/", validate(campusValidation.list, "query"), campusController.list);
campusRouter.post("/", validate(campusValidation.create), campusController.create);
campusRouter.get("/:id", validate(commonValidation.idParam, "params"), campusController.getById);
campusRouter.patch("/:id", validate(commonValidation.idParam, "params"), validate(campusValidation.update), campusController.update);
campusRouter.delete("/:id", validate(commonValidation.idParam, "params"), campusController.remove);

export default campusRouter;
