// Institution details live on the tenant row; every other setting on its tenant_settings row
export const TENANT_FIELDS = ["name", "contactEmail", "phone", "address", "website", "brandColor"];

export const BOOLEAN_SETTINGS = [
    "autoAssessment",
    "autoLetterGeneration",
    "autoEmailDispatch",
    "autoApproveOffers",
    "autoApproveRejections",
    "requireRejectionApproval",
    "requireManualReviewEdgeCases",
    "flagLowConfidence",
    "flagMissingDocuments",
    "verifyDocumentType",
    "smtpEnabled",
    "smtpSecure",
];

// Each setting that picks an AI model, with the ai_models code a new tenant starts with
export const DEFAULT_AI_MODELS = {
    extractionModelId: "gpt-5.6-luna",
    extractionFallbackModelId: "gpt-5.6-terra",
    assessmentModelId: "gpt-5.6-terra",
    assessmentEscalationModelId: "gpt-5.6-sol",
};

export const MAX_EMAIL_RETRIES = 10;
export const MAX_PROMPT_LENGTH = 20000;

// Letter branding: the logo (PNG / JPG, at most MAX_LOGO_MB) and the colour used when none is set
export const MAX_LOGO_MB = 2;
export const DEFAULT_BRAND_COLOR = "#1E3A8A";
