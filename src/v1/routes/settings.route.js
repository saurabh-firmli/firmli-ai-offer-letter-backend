import express from "express";
import settingsController from "../controllers/settings.controller.js";
import validate from "../middlewares/validate.middleware.js";
import {uploadLogo} from "../middlewares/upload.middleware.js";
import settingsValidation from "../schemas/validations/settings.validation.js";

// One settings record per tenant. Mounted behind authenticate and authorize(MODULES.SETTINGS); the module
// has only read and update, so "send test email" (a POST) and removing the logo (a DELETE) need update too
const settingsRouter = express.Router();

settingsRouter.get("/", settingsController.get);
settingsRouter.get("/options", settingsController.options);
settingsRouter.patch("/", validate(settingsValidation.update), settingsController.update);
settingsRouter.post("/test-email", validate(settingsValidation.testEmail), settingsController.sendTestEmail);
settingsRouter.put("/logo", uploadLogo, settingsController.saveLogo);
settingsRouter.delete("/logo", settingsController.removeLogo);

export default settingsRouter;
