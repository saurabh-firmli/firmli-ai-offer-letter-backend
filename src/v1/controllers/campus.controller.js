import { asyncHandler } from "../utils/asyncHandler.js";
import responseHelper from "../helpers/response.helper.js";
import campusService from "../services/campus.service.js";

const campusController = {
  list: asyncHandler(async (req, res) => {
    const campuses = await campusService.list(req.query, req.user.tenantId);
    return responseHelper.ok(res, campuses);
  }),

  getById: asyncHandler(async (req, res) => {
    const campus = await campusService.getById(req.params.id, req.user.tenantId);
    return responseHelper.ok(res, campus);
  }),

  create: asyncHandler(async (req, res) => {
    const campus = await campusService.create(req.body, req.user.tenantId);
    return responseHelper.created(res, campus, "Campus created");
  }),

  update: asyncHandler(async (req, res) => {
    const campus = await campusService.update(req.params.id, req.body, req.user.tenantId);
    return responseHelper.ok(res, campus, "Campus updated");
  }),

  remove: asyncHandler(async (req, res) => {
    await campusService.remove(req.params.id, req.user.tenantId);
    return responseHelper.ok(res, null, "Campus deleted");
  }),
};

export default campusController;
