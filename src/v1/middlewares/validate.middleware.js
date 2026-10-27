import _ from "lodash";
import {HTTP_RESPONSES} from "../constants/http-response-messages.constants.js";
import responseHelper from "../helpers/response.helper.js";

/**
 * Validates req[source] against a Joi schema. On success the converted values replace the
 * originals; on failure answers 422 with {field: message} for every invalid field.
 *
 * @param {import("joi").ObjectSchema} schema
 * @param {"body" | "query" | "params"} source
 * @example router.post("/", validate(createSchema), controller.create)
 */
const validate = (schema, source = "body") => (req, res, next) => {
    const {error, value} = schema.validate(req[source], {abortEarly: false});

    if (error) {
        // An error about the whole object (e.g. an empty body) has no field path, so it goes under `source`
        const errors = _.fromPairs(
            error.details.map((detail) => [detail.path.join(".") || source, detail.message.replace(/"/g, "")])
        );
        return responseHelper.errorResponse(res, HTTP_RESPONSES.HTTP_UNPROCESSABLE_ENTITY, errors);
    }

    // req.query is a getter in Express 5, so assign onto it rather than replacing it
    if (source === "query") {
        Object.keys(req.query).forEach((key) => delete req.query[key]);
        Object.assign(req.query, value);
    } else {
        req[source] = value;
    }

    return next();
};

export default validate;
