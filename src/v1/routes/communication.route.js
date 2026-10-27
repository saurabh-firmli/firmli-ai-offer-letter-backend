import express from "express";
import communicationController from "../controllers/communication.controller.js";
import {authorize} from "../middlewares/auth.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import commonValidation from "../schemas/validations/common.validation.js";
import communicationValidation from "../schemas/validations/communication.validation.js";
import {MODULES} from "../constants/module.constants.js";

// Mounted behind authenticate. Communications: read the log, update to retry (a POST action).
// Sending a letter is POST /v1/letters/:id/send (Communications create)
const communicationRouter = express.Router();
const id = validate(commonValidation.idParam, "params");
const read = authorize(MODULES.COMMUNICATIONS, "read");
const update = authorize(MODULES.COMMUNICATIONS, "update");

communicationRouter.get("/options", read, communicationController.options);
communicationRouter.get("/", read, validate(communicationValidation.list, "query"), communicationController.list);
communicationRouter.get("/:id", read, id, communicationController.getById);
communicationRouter.post("/:id/retry", update, id, communicationController.retry);

export default communicationRouter;
