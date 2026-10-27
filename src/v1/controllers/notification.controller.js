import { asyncHandler } from "../utils/asyncHandler.js";
import responseHelper from "../helpers/response.helper.js";
import notificationService from "../services/notification.service.js";

const notificationController = {
  get: asyncHandler(async (req, res) => {
    const notifications = await notificationService.get(req.user);
    return responseHelper.ok(res, notifications);
  }),
};

export default notificationController;
