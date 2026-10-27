import { asyncHandler } from "../utils/asyncHandler.js";
import responseHelper from "../helpers/response.helper.js";
import userService from "../services/user.service.js";

const userController = {
  list: asyncHandler(async (req, res) => {
    const users = await userService.list(req.query, req.user.tenantId);
    return responseHelper.ok(res, users);
  }),

  create: asyncHandler(async (req, res) => {
    const user = await userService.create(req.body, req.user);
    return responseHelper.created(res, user, "User created");
  }),

  update: asyncHandler(async (req, res) => {
    const user = await userService.update(req.params.id, req.body, req.user);
    return responseHelper.ok(res, user, "User updated");
  }),

  sendCredentials: asyncHandler(async (req, res) => {
    const result = await userService.sendCredentials(req.params.id, req.body.password, req.user);
    return responseHelper.ok(res, result, `Login details sent to ${result.sentTo}`);
  }),

  remove: asyncHandler(async (req, res) => {
    await userService.remove(req.params.id, req.user);
    return responseHelper.ok(res, null, "User deleted");
  }),
};

export default userController;
