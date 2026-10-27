import { asyncHandler } from "../utils/asyncHandler.js";
import { HTTP_RESPONSES } from "../constants/http-response-messages.constants.js";
import responseHelper from "../helpers/response.helper.js";
import eligibilitySetService from "../services/eligibilitySet.service.js";
import eligibilityVersionService from "../services/eligibilityVersion.service.js";
import eligibilityCriteriaService from "../services/eligibilityCriteria.service.js";

const { HTTP_OK, HTTP_CREATED } = HTTP_RESPONSES;

const eligibilityController = {
  options: asyncHandler(async (req, res) => {
    const options = await eligibilityCriteriaService.options();
    return responseHelper.successResponse(res, HTTP_OK, options);
  }),

  listSets: asyncHandler(async (req, res) => {
    const sets = await eligibilitySetService.list(req.query, req.user.tenantId);
    return responseHelper.successResponse(res, HTTP_OK, sets);
  }),

  getSet: asyncHandler(async (req, res) => {
    const set = await eligibilitySetService.getById(req.params.id, req.user.tenantId);
    return responseHelper.successResponse(res, HTTP_OK, set);
  }),

  createSet: asyncHandler(async (req, res) => {
    const set = await eligibilitySetService.create(req.body, req.user.tenantId);
    return responseHelper.successResponse(res, HTTP_CREATED, set, "Eligibility set created");
  }),

  updateSet: asyncHandler(async (req, res) => {
    const set = await eligibilitySetService.update(req.params.id, req.body, req.user.tenantId);
    return responseHelper.successResponse(res, HTTP_OK, set, "Eligibility set updated");
  }),

  removeSet: asyncHandler(async (req, res) => {
    await eligibilitySetService.remove(req.params.id, req.user.tenantId);
    return responseHelper.successResponse(res, HTTP_OK, null, "Eligibility set deleted");
  }),

  assignPrograms: asyncHandler(async (req, res) => {
    const set = await eligibilitySetService.assignPrograms(req.params.id, req.body.programIds, req.user.tenantId);
    return responseHelper.successResponse(res, HTTP_OK, set, "Programs updated");
  }),

  createVersion: asyncHandler(async (req, res) => {
    const version = await eligibilityVersionService.createDraft(req.params.id, req.user.tenantId);
    return responseHelper.successResponse(res, HTTP_CREATED, version, "New draft version created");
  }),

  getVersion: asyncHandler(async (req, res) => {
    const version = await eligibilityVersionService.getById(req.params.id, req.user.tenantId);
    return responseHelper.successResponse(res, HTTP_OK, version);
  }),

  publishVersion: asyncHandler(async (req, res) => {
    const version = await eligibilityVersionService.publish(req.params.id, req.user.tenantId);
    return responseHelper.successResponse(res, HTTP_OK, version, "Version published");
  }),

  copyFromVersion: asyncHandler(async (req, res) => {
    const version = await eligibilityVersionService.copyFrom(req.params.id, req.body.versionId, req.user.tenantId);
    return responseHelper.successResponse(res, HTTP_OK, version, "Criteria copied");
  }),

  removeVersion: asyncHandler(async (req, res) => {
    await eligibilityVersionService.remove(req.params.id, req.user.tenantId);
    return responseHelper.successResponse(res, HTTP_OK, null, "Draft version deleted");
  }),

  createCriterion: asyncHandler(async (req, res) => {
    const criterion = await eligibilityCriteriaService.createCriterion(req.params.id, req.body, req.user.tenantId);
    return responseHelper.successResponse(res, HTTP_CREATED, criterion, "Criterion added");
  }),

  reorderCriteria: asyncHandler(async (req, res) => {
    const criteria = await eligibilityCriteriaService.reorderCriteria(req.params.id, req.body.criterionIds, req.user.tenantId);
    return responseHelper.successResponse(res, HTTP_OK, criteria, "Criteria reordered");
  }),

  updateCriterion: asyncHandler(async (req, res) => {
    const criterion = await eligibilityCriteriaService.updateCriterion(req.params.id, req.body, req.user.tenantId);
    return responseHelper.successResponse(res, HTTP_OK, criterion, "Criterion updated");
  }),

  removeCriterion: asyncHandler(async (req, res) => {
    await eligibilityCriteriaService.removeCriterion(req.params.id, req.user.tenantId);
    return responseHelper.successResponse(res, HTTP_OK, null, "Criterion deleted");
  }),

  createDocumentRequirement: asyncHandler(async (req, res) => {
    const document = await eligibilityCriteriaService.createDocumentRequirement(req.params.id, req.body, req.user.tenantId);
    return responseHelper.successResponse(res, HTTP_CREATED, document, "Document requirement added");
  }),

  updateDocumentRequirement: asyncHandler(async (req, res) => {
    const document = await eligibilityCriteriaService.updateDocumentRequirement(req.params.id, req.body, req.user.tenantId);
    return responseHelper.successResponse(res, HTTP_OK, document, "Document requirement updated");
  }),

  removeDocumentRequirement: asyncHandler(async (req, res) => {
    await eligibilityCriteriaService.removeDocumentRequirement(req.params.id, req.user.tenantId);
    return responseHelper.successResponse(res, HTTP_OK, null, "Document requirement deleted");
  }),
};

export default eligibilityController;
