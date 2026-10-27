import { asyncHandler } from "../utils/asyncHandler.js";
import responseHelper from "../helpers/response.helper.js";
import aiUsageService from "../services/aiUsage.service.js";

const aiUsageController = {
  list: asyncHandler(async (req, res) => {
    const result = await aiUsageService.list(req.query, req.user.tenantId);
    return responseHelper.ok(res, result);
  }),

  summary: asyncHandler(async (req, res) => {
    const summary = await aiUsageService.summary(req.query, req.user.tenantId);
    return responseHelper.ok(res, summary);
  }),
};

export default aiUsageController;
