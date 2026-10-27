import Joi from "joi";

const id = Joi.number().integer().positive();

const isDateOnly = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !isNaN(date) && date.toISOString().startsWith(value);
};

const day = Joi.string()
    .custom((value, helpers) => (isDateOnly(value) ? value : helpers.error("any.invalid")))
    .messages({"any.invalid": "{{#label}} must be a valid date in YYYY-MM-DD format"});

const commonValidation = {
    id,
    optionalId: id.allow(null, ""),
    idList: Joi.array().items(id).unique(),
    idParam: Joi.object({id: id.required()}),

    // Report period: from / to days and the viewer's offset from UTC in minutes (see dateHelper)
    period: {
        from: day,
        to: day,
        utcOffset: Joi.number().integer().min(-720).max(840).default(0),
    },

    pagination: {
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
    },

    email: Joi.string().trim().lowercase().email().max(255),
    newPassword: Joi.string().min(8).max(72),
    searchText: Joi.string().trim().max(100).allow(""),
    optionalText: (max) => Joi.string().trim().max(max).allow(null, ""),
    phone: Joi.string()
        .trim()
        .max(30)
        .custom((value, helpers) => {
            if (!/^[0-9+().\-\s]+$/.test(value)) return helpers.error("phone.invalid");
            const compact = value.replace(/[().\-\s]/g, "").replace(/^00/, "+");
            return /^\+[1-9]\d{6,14}$/.test(compact) ? compact : helpers.error("phone.invalid");
        })
        .messages({"phone.invalid": "Enter the number with its country code, e.g. +919876543210"})
        .allow(null, ""),

    isDateOnly,
    day,
    dateOnly: day.allow(null, ""),

    createSchema: (fields) => Joi.object(fields).options({stripUnknown: true}),

    updateSchema: (fields) =>
        Joi.object(fields)
            .min(1)
            .messages({"object.min": "Send at least one field to update"})
            .options({stripUnknown: true}),
};

export default commonValidation;
