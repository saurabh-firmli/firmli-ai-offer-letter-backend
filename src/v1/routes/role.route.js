import express from "express";
import roleController from "../controllers/role.controller.js";
import validate from "../middlewares/validate.middleware.js";
import commonValidation from "../schemas/validations/common.validation.js";
import roleValidation from "../schemas/validations/role.validation.js";

// Roles are the same for every tenant; their permissions can be changed per tenant (not the Super Admin's).
// Mounted behind authenticate and authorize(MODULES.ROLES). The module has only read and update, so the POST reset needs update
const roleRouter = express.Router();
const id = validate(commonValidation.idParam, "params");

roleRouter.get("/", roleController.list);
roleRouter.put("/:id/permissions", id, validate(roleValidation.updatePermissions), roleController.updatePermissions);
roleRouter.post("/:id/permissions/reset", id, roleController.resetPermissions);

export default roleRouter;
