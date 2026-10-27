import _ from "lodash";

// Reads a value as the criterion's data type; undefined when it is not one
const PARSE = {
    number: (value) => {
        const number = Number(String(value).replace(/,/g, "").trim());
        return String(value).trim() !== "" && Number.isFinite(number) ? number : undefined;
    },
    date: (value) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value).trim()) ? String(value).trim() : undefined),
    boolean: (value) => ({true: true, yes: true, false: false, no: false})[String(value).trim().toLowerCase()],
    text: (value) => String(value).trim().toLowerCase() || undefined,
};

// -1 / 0 / 1; YYYY-MM-DD dates compare correctly as text
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const TESTS = {
    equal_to: (value, [required]) => compare(value, required) === 0,
    not_equal_to: (value, [required]) => compare(value, required) !== 0,
    greater_than: (value, [required]) => compare(value, required) > 0,
    greater_than_or_equal: (value, [required]) => compare(value, required) >= 0,
    less_than: (value, [required]) => compare(value, required) < 0,
    less_than_or_equal: (value, [required]) => compare(value, required) <= 0,
    between: (value, [min, max]) => compare(value, min) >= 0 && compare(value, max) <= 0,
    one_of: (value, options) => options.some((option) => compare(value, option) === 0),
    contains: (value, [required]) => String(value).includes(String(required)),
};

/**
 * Checks an applicant's value against an eligibility criterion. The AI only finds the value; the
 * comparison is done here, so the result is exact and explainable ("3.4 >= 3.0").
 */
const criteriaHelper = {
    /**
     * "met", "not_met", or "unclear" when there is no value or it is not of the criterion's type.
     * @example criteriaHelper.evaluate({dataType: "number", operator: "greater_than_or_equal", requiredValue: "3.0"}, "3.4") // "met"
     */
    evaluate: ({dataType, operator, requiredValue}, foundValue) => {
        if (_.isNil(foundValue) || String(foundValue).trim() === "") return "unclear";
        const value = PARSE[dataType](foundValue);
        const isList = operator === "between" || operator === "one_of";
        const required = (isList ? requiredValue.split(",") : [requiredValue]).map((item) => PARSE[dataType](item));
        if (value === undefined || required.some((item) => item === undefined)) return "unclear";
        return TESTS[operator](value, required) ? "met" : "not_met";
    },

    // Criteria that apply on a day: effective date not later, expiry date not earlier
    isInForce: ({effectiveDate, expiryDate}, day) => (!effectiveDate || effectiveDate <= day) && (!expiryDate || expiryDate >= day),
};

export default criteriaHelper;
