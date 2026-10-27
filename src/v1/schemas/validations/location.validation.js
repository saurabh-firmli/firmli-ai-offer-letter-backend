import Joi from "joi";
import common from "./common.validation.js";

const locationValidation = {
    countries: Joi.object({search: common.searchText}),

    states: Joi.object({countryId: common.id.required(), search: common.searchText}),

    cities: Joi.object({stateId: common.id.required(), search: common.searchText}),
};

export default locationValidation;
