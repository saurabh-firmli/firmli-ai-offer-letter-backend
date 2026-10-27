import { asyncHandler } from "../utils/asyncHandler.js";
import responseHelper from "../helpers/response.helper.js";
import emailTemplateService from "../services/emailTemplate.service.js";

const emailTemplateController = {
  list: asyncHandler(async (req, res) => {
    const templates = await emailTemplateService.list(req.query, req.user.tenantId);
    return responseHelper.ok(res, templates);
  }),

  getById: asyncHandler(async (req, res) => {
    const template = await emailTemplateService.getById(req.params.id, req.user.tenantId);
    return responseHelper.ok(res, template);
  }),

  create: asyncHandler(async (req, res) => {
    const template = await emailTemplateService.create(req.body, req.user.tenantId);
    return responseHelper.created(res, template, "Email template created");
  }),

  update: asyncHandler(async (req, res) => {
    const template = await emailTemplateService.update(req.params.id, req.body, req.user.tenantId);
    return responseHelper.ok(res, template, "Email template updated");
  }),

  remove: asyncHandler(async (req, res) => {
    await emailTemplateService.remove(req.params.id, req.user.tenantId);
    return responseHelper.ok(res, null, "Email template deleted");
  }),
};

export default emailTemplateController;
