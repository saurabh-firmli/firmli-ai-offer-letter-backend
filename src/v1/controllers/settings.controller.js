import { asyncHandler } from "../utils/asyncHandler.js";
import responseHelper from "../helpers/response.helper.js";
import settingsService from "../services/settings.service.js";

const settingsController = {
  get: asyncHandler(async (req, res) => {
    const settings = await settingsService.get(req.user.tenantId);
    return responseHelper.ok(res, settings);
  }),

  options: asyncHandler(async (req, res) => {
    const options = await settingsService.options(req.user.tenantId);
    return responseHelper.ok(res, options);
  }),

  sendTestEmail: asyncHandler(async (req, res) => {
    const result = await settingsService.sendTestEmail(req.body.to, req.user);
    return responseHelper.ok(res, result, `Test email sent to ${result.sentTo}`);
  }),

  update: asyncHandler(async (req, res) => {
    const settings = await settingsService.update(req.body, req.user.tenantId);
    return responseHelper.ok(res, settings, "Settings saved");
  }),

  saveLogo: asyncHandler(async (req, res) => responseHelper.ok(res, await settingsService.saveLogo(req.file, req.user.tenantId), "Logo saved")),

  removeLogo: asyncHandler(async (req, res) => responseHelper.ok(res, await settingsService.removeLogo(req.user.tenantId), "Logo removed")),
};

export default settingsController;
