import { asyncHandler } from "../utils/asyncHandler.js";
import { HTTP_RESPONSES } from "../constants/http-response-messages.constants.js";
import responseHelper from "../helpers/response.helper.js";
import applicationService from "../services/application.service.js";
import assessmentService from "../services/assessment.service.js";
import applicationNoteService from "../services/applicationNote.service.js";
import applicationActivityService from "../services/applicationActivity.service.js";

const applicationController = {
  options: asyncHandler(async (req, res) => responseHelper.ok(res, await applicationService.options(req.user.tenantId))),

  list: asyncHandler(async (req, res) => responseHelper.ok(res, await applicationService.list(req.query, req.user.tenantId))),

  getById: asyncHandler(async (req, res) => responseHelper.ok(res, await applicationService.getById(req.params.id, req.user.tenantId))),

  create: asyncHandler(async (req, res) => {
    const application = await applicationService.create(req.body, req.user.tenantId);
    return responseHelper.created(res, application, "Application created");
  }),

  update: asyncHandler(async (req, res) =>
    responseHelper.ok(res, await applicationService.update(req.params.id, req.body, req.user.tenantId), "Application updated")
  ),

  remove: asyncHandler(async (req, res) => {
    await applicationService.remove(req.params.id, req.user.tenantId);
    return responseHelper.ok(res, null, "Application deleted");
  }),

  submit: asyncHandler(async (req, res) => responseHelper.ok(res, await applicationService.submit(req.params.id, req.user), "Application submitted")),

  // Run Assessment: answers 202 at once, the run continues in the background
  assess: asyncHandler(async (req, res) => {
    const assessmentId = await assessmentService.start(req.params.id, req.user);
    const assessment = await assessmentService.getById(assessmentId, req.user.tenantId);
    return responseHelper.successResponse(res, HTTP_RESPONSES.HTTP_ACCEPTED, assessment, "Assessment started");
  }),

  latestAssessment: asyncHandler(async (req, res) => responseHelper.ok(res, await assessmentService.latest(req.params.id, req.user.tenantId))),

  assessmentHistory: asyncHandler(async (req, res) => responseHelper.ok(res, await assessmentService.history(req.params.id, req.user.tenantId))),

  assessment: asyncHandler(async (req, res) => responseHelper.ok(res, await assessmentService.getById(req.params.id, req.user.tenantId))),

  // The AI reads one document now (up to about a minute), outside an assessment run
  extractDocument: asyncHandler(async (req, res) => responseHelper.ok(res, await assessmentService.extractDocument(req.params.id, req.user), "Document read")),

  documentExtraction: asyncHandler(async (req, res) => responseHelper.ok(res, await assessmentService.latestExtraction(req.params.id, req.user.tenantId))),

  changeOutcome: asyncHandler(async (req, res) =>
    responseHelper.ok(res, await applicationService.changeOutcome(req.params.id, req.body, req.user), "Outcome changed")
  ),

  activity: asyncHandler(async (req, res) =>
    responseHelper.ok(res, await applicationActivityService.list(req.params.id, req.query, req.user.tenantId))
  ),

  notes: asyncHandler(async (req, res) => responseHelper.ok(res, await applicationNoteService.listFor(req.params.id, req.user.tenantId))),

  addNote: asyncHandler(async (req, res) => {
    const note = await applicationNoteService.create({applicationId: req.params.id}, req.body.note, req.user);
    return responseHelper.created(res, note, "Note added");
  }),

  assignOfficer: asyncHandler(async (req, res) =>
    responseHelper.ok(res, await applicationService.assignOfficer(req.params.id, req.body.officerId, req.user.tenantId), "Officer updated")
  ),

  uploadDocument: asyncHandler(async (req, res) => {
    const document = await applicationService.uploadDocument(req.params.id, req.body.documentTypeId, req.file, req.user);
    return responseHelper.created(res, document, "Document uploaded");
  }),

  removeDocument: asyncHandler(async (req, res) => {
    await applicationService.removeDocument(req.params.id, req.user.tenantId);
    return responseHelper.ok(res, null, "Document deleted");
  }),

  documentDownloadUrl: asyncHandler(async (req, res) =>
    responseHelper.ok(res, await applicationService.documentDownloadUrl(req.params.id, req.user.tenantId))
  ),
};

export default applicationController;
