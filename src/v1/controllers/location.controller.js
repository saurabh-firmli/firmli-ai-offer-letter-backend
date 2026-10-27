import { asyncHandler } from "../utils/asyncHandler.js";
import responseHelper from "../helpers/response.helper.js";
import locationService from "../services/location.service.js";

const locationController = {
  countries: asyncHandler(async (req, res) => {
    const countries = await locationService.countries(req.query);
    return responseHelper.ok(res, countries);
  }),

  states: asyncHandler(async (req, res) => {
    const states = await locationService.states(req.query);
    return responseHelper.ok(res, states);
  }),

  cities: asyncHandler(async (req, res) => {
    const cities = await locationService.cities(req.query);
    return responseHelper.ok(res, cities);
  }),
};

export default locationController;
