import express from "express";
import reportController from "../controllers/report.controller.js";
import validate from "../middlewares/validate.middleware.js";
import dashboardValidation from "../schemas/validations/dashboard.validation.js";

// Mounted behind authenticate + authorize(MODULES.APPLICATIONS): reports read applications.
// Same filters as the dashboard: period (from, to, utcOffset) and programId
const reportRouter = express.Router();
const filters = validate(dashboardValidation.get, "query");

reportRouter.get("/", filters, reportController.get);
reportRouter.get("/export", filters, reportController.exportCsv);

export default reportRouter;
