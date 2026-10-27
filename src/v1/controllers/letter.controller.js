import { asyncHandler } from "../utils/asyncHandler.js";
import { LETTER_STATUS_LABELS } from "../constants/letter.constants.js";
import { LETTER_TYPE_LABELS } from "../constants/letter-template.constants.js";
import responseHelper from "../helpers/response.helper.js";
import letterService from "../services/letter.service.js";

const letterController = {
  options: (req, res) => responseHelper.ok(res, {statuses: responseHelper.labelOptions(LETTER_STATUS_LABELS), letterTypes: responseHelper.labelOptions(LETTER_TYPE_LABELS)}),

  list: asyncHandler(async (req, res) => responseHelper.ok(res, await letterService.list(req.query, req.user.tenantId))),

  getById: asyncHandler(async (req, res) => responseHelper.ok(res, await letterService.getById(req.params.id, req.user.tenantId))),

  downloadUrl: asyncHandler(async (req, res) => responseHelper.ok(res, await letterService.downloadUrl(req.params.id, req.user.tenantId, req.query))),

  approve: asyncHandler(async (req, res) => responseHelper.ok(res, await letterService.approve(req.params.id, req.body, req.user), "Letter approved")),

  reject: asyncHandler(async (req, res) => responseHelper.ok(res, await letterService.reject(req.params.id, req.body, req.user), "Letter rejected")),

  // Under /v1/applications/:id/letters
  listForApplication: asyncHandler(async (req, res) => responseHelper.ok(res, await letterService.listFor(req.params.id, req.user.tenantId))),

  generate: asyncHandler(async (req, res) => {
    const letter = await letterService.generate(req.params.id, req.user);
    return responseHelper.created(res, letter, "Letter generated");
  }),

  // Under /v1/letter-templates/:id/preview-pdf: the PDF itself (not JSON), shown in the browser
  previewPdf: asyncHandler(async (req, res) => {
    const pdf = await letterService.previewPdf(req.params.id, req.query.applicationId, req.user.tenantId);
    res.set({"Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="preview.pdf"', "Cache-Control": "no-store"});
    return res.send(pdf);
  }),

  // Under /v1/letter-templates/:id/preview
  preview: asyncHandler(async (req, res) =>
    responseHelper.ok(res, await letterService.preview(req.params.id, req.query.applicationId, req.user.tenantId))
  ),
};

export default letterController;
