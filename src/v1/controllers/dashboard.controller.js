import { asyncHandler } from "../utils/asyncHandler.js";
import responseHelper from "../helpers/response.helper.js";
import dashboardService from "../services/dashboard.service.js";

const dashboardController = {
  get: asyncHandler(async (req, res) => {
    const dashboard = await dashboardService.get(req.query, req.user.tenantId);
    return responseHelper.ok(res, dashboard);
  }),
};

export default dashboardController;
