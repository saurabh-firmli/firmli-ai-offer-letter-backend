import express from "express";
import aiUsageController from "../controllers/aiUsage.controller.js";
import validate from "../middlewares/validate.middleware.js";
import aiUsageValidation from "../schemas/validations/aiUsage.validation.js";

// Read only: usage is written by the AI code (aiUsageService.record), never through the API
const aiUsageRouter = express.Router();

aiUsageRouter.get("/summary", validate(aiUsageValidation.summary, "query"), aiUsageController.summary);
aiUsageRouter.get("/", validate(aiUsageValidation.list, "query"), aiUsageController.list);

export default aiUsageRouter;
