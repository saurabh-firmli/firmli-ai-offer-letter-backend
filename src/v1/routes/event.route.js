import express from "express";
import eventController from "../controllers/event.controller.js";
import authenticate from "../middlewares/auth.middleware.js";

// Live updates (Server-Sent Events). The stream checks its own ticket: EventSource cannot send a header
const eventRouter = express.Router();

eventRouter.post("/ticket", authenticate, eventController.ticket);
eventRouter.get("/", eventController.stream);

export default eventRouter;
