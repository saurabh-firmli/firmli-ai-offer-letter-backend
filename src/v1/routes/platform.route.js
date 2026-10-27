import express from "express";
import platformController from "../controllers/platform.controller.js";
import validate from "../middlewares/validate.middleware.js";
import commonValidation from "../schemas/validations/common.validation.js";
import platformValidation from "../schemas/validations/platform.validation.js";

// Mounted behind authenticate + platformOnly: the Platform admin panel, for Firmli staff only
const platformRouter = express.Router();
const id = validate(commonValidation.idParam, "params");

platformRouter.get("/options", platformController.options);
platformRouter.get("/tenants", validate(platformValidation.list, "query"), platformController.list);
platformRouter.post("/tenants", validate(platformValidation.create), platformController.create);
platformRouter.get("/tenants/:id", id, platformController.getById);
platformRouter.patch("/tenants/:id", id, validate(platformValidation.update), platformController.update);
platformRouter.delete("/tenants/:id", id, platformController.remove);
platformRouter.post("/tenants/:id/users", id, validate(platformValidation.addUser), platformController.addUser);
platformRouter.post(
    "/tenants/:id/users/:userId/send-credentials",
    validate(platformValidation.userParams, "params"),
    validate(platformValidation.sendCredentials),
    platformController.sendCredentials
);

export default platformRouter;
