import { asyncHandler } from "../utils/asyncHandler.js";
import { STUDENT_EMAIL_STATUS_LABELS, STUDENT_EMAIL_STATUSES } from "../constants/communication.constants.js";
import { EMAIL_TYPE_LABELS } from "../constants/email-template.constants.js";
import responseHelper from "../helpers/response.helper.js";
import communicationService from "../services/communication.service.js";

// The answer's message says how the (first) try went
const SEND_MESSAGES = {
  [STUDENT_EMAIL_STATUSES.SENT]: "Email sent",
  [STUDENT_EMAIL_STATUSES.RETRYING]: "The email could not be sent yet; it will be retried",
  [STUDENT_EMAIL_STATUSES.FAILED]: "The email could not be sent",
};

const communicationController = {
  options: (req, res) => responseHelper.ok(res, {statuses: responseHelper.labelOptions(STUDENT_EMAIL_STATUS_LABELS), emailTypes: responseHelper.labelOptions(EMAIL_TYPE_LABELS)}),

  list: asyncHandler(async (req, res) => responseHelper.ok(res, await communicationService.list(req.query, req.user.tenantId))),

  getById: asyncHandler(async (req, res) => responseHelper.ok(res, await communicationService.getById(req.params.id, req.user.tenantId))),

  retry: asyncHandler(async (req, res) => {
    const email = await communicationService.retry(req.params.id, req.user);
    return responseHelper.ok(res, email, SEND_MESSAGES[email.status]);
  }),

  // Under /v1/applications/:id/emails
  listForApplication: asyncHandler(async (req, res) =>
    responseHelper.ok(res, await communicationService.list({page: 1, limit: 100, applicationId: req.params.id}, req.user.tenantId))
  ),

  // Under /v1/letters/:id/send
  sendLetter: asyncHandler(async (req, res) => {
    const email = await communicationService.sendLetter(req.params.id, req.body, req.user);
    return responseHelper.created(res, email, SEND_MESSAGES[email.status]);
  }),
};

export default communicationController;
