import express from "express";
import locationController from "../controllers/location.controller.js";
import validate from "../middlewares/validate.middleware.js";
import locationValidation from "../schemas/validations/location.validation.js";

// Cascading dropdowns: pick a country, then its states, then that state's cities
const locationRouter = express.Router();

locationRouter.get("/countries", validate(locationValidation.countries, "query"), locationController.countries);
locationRouter.get("/states", validate(locationValidation.states, "query"), locationController.states);
locationRouter.get("/cities", validate(locationValidation.cities, "query"), locationController.cities);

export default locationRouter;
