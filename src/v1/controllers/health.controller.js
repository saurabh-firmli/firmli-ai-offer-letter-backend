import { asyncHandler } from "../utils/asyncHandler.js";
import { HTTP_RESPONSES } from "../constants/http-response-messages.constants.js";
import responseHelper from "../helpers/response.helper.js";
import healthService from "../services/health.service.js";

const healthController = {
  getHealth: asyncHandler(async (req, res) => {
    const status = await healthService.getStatus();
    return responseHelper.successResponse(res, HTTP_RESPONSES.HTTP_OK, status);
  }),
};

export default healthController;
