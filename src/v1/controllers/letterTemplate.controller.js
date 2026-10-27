import { asyncHandler } from "../utils/asyncHandler.js";
import responseHelper from "../helpers/response.helper.js";
import letterTemplateService from "../services/letterTemplate.service.js";

const letterTemplateController = {
  variables: asyncHandler(async (req, res) => {
    const variables = await letterTemplateService.variables();
    return responseHelper.ok(res, variables);
  }),

  list: asyncHandler(async (req, res) => {
    const templates = await letterTemplateService.list(req.query, req.user.tenantId);
    return responseHelper.ok(res, templates);
  }),

  getById: asyncHandler(async (req, res) => {
    const template = await letterTemplateService.getById(req.params.id, req.user.tenantId);
    return responseHelper.ok(res, template);
  }),

  create: asyncHandler(async (req, res) => {
    const template = await letterTemplateService.create(req.body, req.user.tenantId);
    return responseHelper.created(res, template, "Letter template created");
  }),

  update: asyncHandler(async (req, res) => {
    const template = await letterTemplateService.update(req.params.id, req.body, req.user.tenantId);
    return responseHelper.ok(res, template, "Letter template updated");
  }),

  remove: asyncHandler(async (req, res) => {
    await letterTemplateService.remove(req.params.id, req.user.tenantId);
    return responseHelper.ok(res, null, "Letter template deleted");
  }),
};

export default letterTemplateController;
