import Joi from "joi";
import common from "./common.validation.js";
import {MAX_EMAIL_RETRIES, MAX_PROMPT_LENGTH} from "../../constants/settings.constants.js";

const threshold = Joi.number().min(0).max(1).precision(2);

const settingsValidation = {
    testEmail: Joi.object({to: common.email}),

    update: common.updateSchema({
        name: Joi.string().trim().max(150),
        contactEmail: common.email.allow(null, ""),
        phone: common.phone,
        address: common.optionalText(500),
        website: Joi.string()
            .trim()
            .max(255)
            .uri({scheme: ["http", "https"]})
            .messages({"string.uri": "Enter the full web address, e.g. https://www.example.com", "string.uriCustomScheme": "Enter the full web address, e.g. https://www.example.com"})
            .allow(null, ""),
        brandColor: Joi.string()
            .trim()
            .pattern(/^#[0-9a-fA-F]{6}$/)
            .uppercase()
            .messages({"string.pattern.base": "Enter a colour like #1E3A8A"})
            .allow(null, ""),

        autoAssessment: Joi.boolean(),
        autoLetterGeneration: Joi.boolean(),
        autoEmailDispatch: Joi.boolean(),

        autoApproveOffers: Joi.boolean(),
        autoApproveRejections: Joi.boolean(),
        requireRejectionApproval: Joi.boolean(),
        requireManualReviewEdgeCases: Joi.boolean(),
        flagLowConfidence: Joi.boolean(),
        flagMissingDocuments: Joi.boolean(),
        offerConfidenceThreshold: threshold,
        rejectionConfidenceThreshold: threshold,

        defaultReviewerId: common.optionalId,
        emailMaxRetries: Joi.number().integer().min(0).max(MAX_EMAIL_RETRIES),

        smtpEnabled: Joi.boolean(),
        smtpHost: Joi.string().trim().hostname().max(255).allow(null, "").messages({"string.hostname": "Enter a server name such as smtp.example.com"}),
        smtpPort: Joi.number().integer().port().allow(null),
        smtpSecure: Joi.boolean(),
        smtpUser: common.optionalText(255),
        smtpPassword: Joi.string().max(500).allow(null, ""),
        smtpFromEmail: common.email.allow(null, ""),
        smtpFromName: common.optionalText(150),

        extractionModelId: common.id,
        extractionFallbackModelId: common.id,
        assessmentModelId: common.id,
        assessmentEscalationModelId: common.id,
        verifyDocumentType: Joi.boolean(),
        openaiApiKey: Joi.string()
            .trim()
            .pattern(/^sk-\S{16,}$/)
            .max(500)
            .messages({"string.pattern.base": "Enter a valid OpenAI API key (it starts with sk-)"})
            .allow(null, ""),
        extractionPrompt: common.optionalText(MAX_PROMPT_LENGTH),
        assessmentPrompt: common.optionalText(MAX_PROMPT_LENGTH),
    }),
};

export default settingsValidation;
