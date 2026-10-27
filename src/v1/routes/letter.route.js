import express from "express";
import letterController from "../controllers/letter.controller.js";
import {authorize} from "../middlewares/auth.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import commonValidation from "../schemas/validations/common.validation.js";
import letterValidation from "../schemas/validations/letter.validation.js";
import communicationController from "../controllers/communication.controller.js";
import communicationValidation from "../schemas/validations/communication.validation.js";
import {MODULES} from "../constants/module.constants.js";

// Mounted behind authenticate. Letters: read to see and download, update to approve / reject (POST actions).
// Generating is under /v1/applications/:id/letters; sending (Communications create) is POST /:id/send
const letterRouter = express.Router();
const id = validate(commonValidation.idParam, "params");
const read = authorize(MODULES.LETTERS, "read");
const update = authorize(MODULES.LETTERS, "update");

letterRouter.get("/options", read, letterController.options);
letterRouter.get("/", read, validate(letterValidation.list, "query"), letterController.list);
letterRouter.get("/:id", read, id, letterController.getById);
letterRouter.get("/:id/download-url", read, id, validate(letterValidation.downloadUrl, "query"), letterController.downloadUrl);
letterRouter.post("/:id/approve", update, id, validate(letterValidation.approve), letterController.approve);
letterRouter.post("/:id/reject", update, id, validate(letterValidation.reject), letterController.reject);
letterRouter.post(
    "/:id/send",
    authorize(MODULES.COMMUNICATIONS, "create"),
    id,
    validate(communicationValidation.sendLetter),
    communicationController.sendLetter
);

export default letterRouter;
