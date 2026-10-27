import express from "express";
import dashboardController from "../controllers/dashboard.controller.js";
import validate from "../middlewares/validate.middleware.js";
import dashboardValidation from "../schemas/validations/dashboard.validation.js";

// Mounted behind authenticate + authorize(MODULES.APPLICATIONS): the dashboard reads applications
const dashboardRouter = express.Router();

dashboardRouter.get("/", validate(dashboardValidation.get, "query"), dashboardController.get);

export default dashboardRouter;
