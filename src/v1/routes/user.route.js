import express from "express";
import userController from "../controllers/user.controller.js";
import validate from "../middlewares/validate.middleware.js";
import commonValidation from "../schemas/validations/common.validation.js";
import userValidation from "../schemas/validations/user.validation.js";

// Mounted behind authenticate + authorize(MODULES.USERS): users of the logged in user's tenant
const userRouter = express.Router();

userRouter.get("/", validate(userValidation.list, "query"), userController.list);
userRouter.post("/", validate(userValidation.create), userController.create);
userRouter.patch("/:id", validate(commonValidation.idParam, "params"), validate(userValidation.update), userController.update);
// The "Send by Email" button after creating a user (POST, so it needs the Users create permission)
userRouter.post(
    "/:id/send-credentials",
    validate(commonValidation.idParam, "params"),
    validate(userValidation.sendCredentials),
    userController.sendCredentials
);
userRouter.delete("/:id", validate(commonValidation.idParam, "params"), userController.remove);

export default userRouter;
