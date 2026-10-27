import { asyncHandler } from "../utils/asyncHandler.js";
import { EMAIL_STATUSES } from "../constants/review.constants.js";
import responseHelper from "../helpers/response.helper.js";
import manualReviewService from "../services/manualReview.service.js";

const DOCUMENT_REQUEST_MESSAGES = {
  [EMAIL_STATUSES.SENT]: "Documents requested; the student was emailed",
  [EMAIL_STATUSES.FAILED]: "Documents requested, but the email to the student could not be sent",
  [EMAIL_STATUSES.NOT_CONFIGURED]: "Documents requested, but email is not configured, so the student was not emailed",
};

const manualReviewController = {
  options: asyncHandler(async (req, res) => responseHelper.ok(res, await manualReviewService.options(req.user.tenantId))),

  list: asyncHandler(async (req, res) => responseHelper.ok(res, await manualReviewService.list(req.query, req.user))),

  getById: asyncHandler(async (req, res) => responseHelper.ok(res, await manualReviewService.getById(req.params.id, req.user.tenantId))),

  assign: asyncHandler(async (req, res) => responseHelper.ok(res, await manualReviewService.assign(req.params.id, req.body, req.user), "Reviewer assigned")),

  requestDocuments: asyncHandler(async (req, res) => {
    const {review, emailStatus} = await manualReviewService.requestDocuments(req.params.id, req.body, req.user);
    return responseHelper.ok(res, {...review, emailStatus}, DOCUMENT_REQUEST_MESSAGES[emailStatus]);
  }),

  addNote: asyncHandler(async (req, res) => {
    const note = await manualReviewService.addNote(req.params.id, req.body.note, req.user);
    return responseHelper.created(res, note, "Note added");
  }),

  decide: asyncHandler(async (req, res) => responseHelper.ok(res, await manualReviewService.decide(req.params.id, req.body, req.user), "Decision saved")),

  overrideCriterion: asyncHandler(async (req, res) =>
    responseHelper.ok(res, await manualReviewService.overrideCriterion(req.params.id, req.params.criterionId, req.body, req.user), "Criterion result saved")
  ),

  returnForReassessment: asyncHandler(async (req, res) =>
    responseHelper.ok(res, await manualReviewService.returnForReassessment(req.params.id, req.body, req.user), "Returned for reassessment")
  ),
};

export default manualReviewController;
