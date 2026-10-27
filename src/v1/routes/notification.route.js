import express from "express";
import notificationController from "../controllers/notification.controller.js";

// Mounted behind authenticate only: each count checks its own module permission (see notification.service.js)
const notificationRouter = express.Router();

notificationRouter.get("/", notificationController.get);

export default notificationRouter;
