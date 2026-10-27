import { asyncHandler } from "../utils/asyncHandler.js";
import responseHelper from "../helpers/response.helper.js";
import dropdownService from "../services/dropdown.service.js";

// Every dropdown answers dropdownService[name](query, tenantId)
const options = (name) => asyncHandler(async (req, res) => responseHelper.ok(res, await dropdownService[name](req.query, req.user.tenantId)));

const dropdownController = {
  programs: options("programs"),
  campuses: options("campuses"),
  eligibilitySets: options("eligibilitySets"),
  letterTemplates: options("letterTemplates"),
  emailTemplates: options("emailTemplates"),
  users: options("users"),
  roles: options("roles"),
};

export default dropdownController;
