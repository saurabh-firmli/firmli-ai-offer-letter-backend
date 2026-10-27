import { asyncHandler } from "../utils/asyncHandler.js";
import responseHelper from "../helpers/response.helper.js";
import platformService from "../services/platform.service.js";

const platformController = {
  options: asyncHandler(async (req, res) => responseHelper.ok(res, await platformService.options())),

  list: asyncHandler(async (req, res) => responseHelper.ok(res, await platformService.list(req.query))),

  getById: asyncHandler(async (req, res) => responseHelper.ok(res, await platformService.getById(req.params.id))),

  create: asyncHandler(async (req, res) => responseHelper.created(res, await platformService.create(req.body), "Tenant created")),

  update: asyncHandler(async (req, res) => responseHelper.ok(res, await platformService.update(req.params.id, req.body), "Tenant updated")),

  remove: asyncHandler(async (req, res) => {
    await platformService.remove(req.params.id);
    return responseHelper.ok(res, null, "Tenant removed");
  }),

  addUser: asyncHandler(async (req, res) => responseHelper.created(res, await platformService.addUser(req.params.id, req.body), "User added")),

  sendCredentials: asyncHandler(async (req, res) => {
    const result = await platformService.sendCredentials(req.params.id, req.params.userId, req.body.password);
    return responseHelper.ok(res, result, `Login details sent to ${result.sentTo}`);
  }),
};

export default platformController;
