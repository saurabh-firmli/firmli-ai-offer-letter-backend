import { asyncHandler } from "../utils/asyncHandler.js";
import responseHelper from "../helpers/response.helper.js";
import auditLogService from "../services/auditLog.service.js";

const auditLogController = {
  list: asyncHandler(async (req, res) => {
    const result = await auditLogService.list(req.query, req.user);
    return responseHelper.ok(res, result);
  }),

  options: asyncHandler(async (req, res) => {
    const options = await auditLogService.options();
    return responseHelper.ok(res, options);
  }),
};

export default auditLogController;
