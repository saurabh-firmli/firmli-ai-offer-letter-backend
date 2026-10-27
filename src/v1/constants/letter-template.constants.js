export const LETTER_TYPE_LABELS = {
    conditional_offer: "Conditional Offer",
    rejection: "Rejection",
    manual_review: "Manual Review",
};

export const LETTER_TYPES = Object.keys(LETTER_TYPE_LABELS);

export const LETTER_TEMPLATE_STATUSES = ["draft", "published"];

// The program field that holds the template for each letter type
export const PROGRAM_TEMPLATE_FIELDS = {
    conditional_offer: "conditionalOfferTemplateId",
    rejection: "rejectionTemplateId",
    manual_review: "manualReviewTemplateId",
};

// Letter template fields that may use {{variables}} (the allowed ones are in the letter_variables table)
export const TEMPLATED_FIELDS = ["subject", "body", "headerHtml", "footerHtml"];

// {{ name }} with optional spaces inside the braces
export const VARIABLE_PATTERN = /{{\s*([^{}]*?)\s*}}/g;
