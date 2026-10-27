import express from "express";
import dropdownController from "../controllers/dropdown.controller.js";
import validate from "../middlewares/validate.middleware.js";
import dropdownValidation from "../schemas/validations/dropdown.validation.js";

// Options for select boxes, each answering [{value, label}] of the user's own tenant. Mounted behind authenticate:
// any logged in user may load them (a name for a dropdown, nothing more)
const dropdownRouter = express.Router();

dropdownRouter.get("/programs", validate(dropdownValidation.programs, "query"), dropdownController.programs);
dropdownRouter.get("/campuses", validate(dropdownValidation.campuses, "query"), dropdownController.campuses);
dropdownRouter.get("/eligibility-sets", validate(dropdownValidation.eligibilitySets, "query"), dropdownController.eligibilitySets);
dropdownRouter.get("/letter-templates", validate(dropdownValidation.letterTemplates, "query"), dropdownController.letterTemplates);
dropdownRouter.get("/email-templates", validate(dropdownValidation.emailTemplates, "query"), dropdownController.emailTemplates);
dropdownRouter.get("/users", validate(dropdownValidation.users, "query"), dropdownController.users);
dropdownRouter.get("/roles", validate(dropdownValidation.roles, "query"), dropdownController.roles);

export default dropdownRouter;
