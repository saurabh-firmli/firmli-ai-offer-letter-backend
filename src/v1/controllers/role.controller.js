import { asyncHandler } from "../utils/asyncHandler.js";
import responseHelper from "../helpers/response.helper.js";
import roleService from "../services/role.service.js";

const roleController = {
  list: asyncHandler(async (req, res) => {
    const roles = await roleService.list(req.user.tenantId);
    return responseHelper.ok(res, roles);
  }),

  updatePermissions: asyncHandler(async (req, res) => {
    const role = await roleService.updatePermissions(req.params.id, req.body.permissions, req.user);
    return responseHelper.ok(res, role, "Permissions updated");
  }),

  resetPermissions: asyncHandler(async (req, res) => {
    const role = await roleService.resetPermissions(req.params.id, req.user);
    return responseHelper.ok(res, role, "Permissions reset to the defaults");
  }),
};

export default roleController;
