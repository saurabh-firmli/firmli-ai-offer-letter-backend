export const DATA_TYPE_LABELS = {
    text: "Text",
    number: "Number",
    boolean: "Yes / No",
    date: "Date",
};

export const OPERATOR_LABELS = {
    equal_to: "Equal to",
    not_equal_to: "Not equal to",
    greater_than: "Greater than",
    greater_than_or_equal: "Greater than or equal to",
    less_than: "Less than",
    less_than_or_equal: "Less than or equal to",
    between: "Between",
    one_of: "One of",
    contains: "Contains",
};

const COMPARISONS = ["equal_to", "not_equal_to", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "between"];

// Which operators make sense for each data type
export const OPERATORS_BY_DATA_TYPE = {
    text: ["equal_to", "not_equal_to", "contains", "one_of"],
    number: [...COMPARISONS, "one_of"],
    boolean: ["equal_to"],
    date: COMPARISONS,
};

export const DATA_TYPES = Object.keys(DATA_TYPE_LABELS);

export const OPERATORS = Object.keys(OPERATOR_LABELS);

