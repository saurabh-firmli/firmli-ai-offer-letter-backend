import { asyncHandler } from "../utils/asyncHandler.js";
import responseHelper from "../helpers/response.helper.js";
import healthService from "../services/health.service.js";

const healthController = {
  getHealth: asyncHandler(async (req, res) => {
    const status = await healthService.getStatus();
    return responseHelper.ok(res, status);
  }),
};

export default healthController;
