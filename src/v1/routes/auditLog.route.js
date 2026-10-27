import express from "express";
import auditLogController from "../controllers/auditLog.controller.js";
import validate from "../middlewares/validate.middleware.js";
import auditLogValidation from "../schemas/validations/auditLog.validation.js";

// Read only: logs are written by the audit hooks, never through the API
const auditLogRouter = express.Router();

auditLogRouter.get("/", validate(auditLogValidation.list, "query"), auditLogController.list);
auditLogRouter.get("/options", auditLogController.options);

export default auditLogRouter;
