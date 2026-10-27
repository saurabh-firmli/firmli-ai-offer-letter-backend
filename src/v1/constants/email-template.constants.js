export const EMAIL_TYPE_LABELS = {
    conditional_offer: "Conditional Offer",
    rejection: "Rejection",
    manual_review: "Manual Review",
    document_request: "Document Request",
    custom: "Custom",
};

export const EMAIL_TYPES = Object.keys(EMAIL_TYPE_LABELS);

export const EMAIL_TEMPLATE_STATUSES = ["draft", "published"];

// Only these types come with a generated PDF letter that can be attached
export const EMAIL_TYPES_WITH_LETTER = ["conditional_offer", "rejection", "manual_review"];

// The program field that holds the email template for each type
export const PROGRAM_EMAIL_TEMPLATE_FIELDS = {
    conditional_offer: "offerEmailTemplateId",
    rejection: "rejectionEmailTemplateId",
};

// Email template fields that may use {{variables}}
export const EMAIL_TEMPLATED_FIELDS = ["subject", "body"];

export const MAX_CC_EMAILS = 20;
