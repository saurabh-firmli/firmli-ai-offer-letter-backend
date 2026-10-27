import { asyncHandler } from "../utils/asyncHandler.js";
import responseHelper from "../helpers/response.helper.js";
import programService from "../services/program.service.js";

const programController = {
  list: asyncHandler(async (req, res) => {
    const result = await programService.list(req.query, req.user.tenantId);
    return responseHelper.ok(res, result);
  }),

  getById: asyncHandler(async (req, res) => {
    const program = await programService.getById(req.params.id, req.user.tenantId);
    return responseHelper.ok(res, program);
  }),

  create: asyncHandler(async (req, res) => {
    const program = await programService.create(req.body, req.user.tenantId);
    return responseHelper.created(res, program, "Program created");
  }),

  update: asyncHandler(async (req, res) => {
    const program = await programService.update(req.params.id, req.body, req.user.tenantId);
    return responseHelper.ok(res, program, "Program updated");
  }),

  remove: asyncHandler(async (req, res) => {
    await programService.remove(req.params.id, req.user.tenantId);
    return responseHelper.ok(res, null, "Program deleted");
  }),
};

export default programController;
