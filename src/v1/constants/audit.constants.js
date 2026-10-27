import _ from "lodash";

export const AUDIT_ACTION_LABELS = {create: "Created", update: "Updated", delete: "Deleted"};
export const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_LABELS);

/**
 * The models whose create / update / delete are logged: the module the log is filed under (a code
 * from the modules table, for the module filter) and a short label of the record, e.g. "Main Campus".
 * unlogged: the model's fields too large or internal to log (on top of UNLOGGED_FIELDS).
 */
export const AUDITED_MODELS = {
    application: {module: "applications", label: (row) => row.applicationNumber},
    student: {module: "applications", label: (row) => row.email},
    applicationDocument: {module: "applications", label: (row) => row.originalName},
    applicationNote: {module: "applications", label: (row) => `Note #${row.id}`},
    applicationLetter: {
        module: "letters",
        label: (row) => row.referenceNumber,
        unlogged: ["headerHtml", "bodyHtml", "footerHtml", "pdfStorageKey", "pdfSizeBytes"],
    },
    manualReview: {module: "reviews", label: (row) => `Review #${row.id}`},
    applicationDocumentRequest: {module: "reviews", label: (row) => `Document request #${row.id}`},
    user: {module: "users", label: (row) => row.email},
    program: {module: "programs", label: (row) => `${row.code} - ${row.name}`},
    campus: {module: "campuses", label: (row) => row.name},
    letterTemplate: {module: "letter_templates", label: (row) => row.name},
    emailTemplate: {module: "email_templates", label: (row) => row.name},
    eligibilitySet: {module: "eligibility", label: (row) => row.name},
    eligibilitySetVersion: {module: "eligibility", label: (row) => `Version ${row.versionNumber}`},
    eligibilityCriterion: {module: "eligibility", label: (row) => row.name},
    eligibilityCriterionDocument: {module: "eligibility", label: () => null},
    eligibilityDocumentRequirement: {module: "eligibility", label: (row) => row.customLabel},
};

// Logged by their service as one entry per save, instead of by the model hooks
export const SERVICE_AUDITED_ENTITIES = {
    role: {module: "roles"},
    settings: {module: "settings"},
    assessmentCriterion: {module: "reviews"},
    tenant: {module: "settings"},
};

export const AUDITED_MODULES = _.uniq(_.map({...AUDITED_MODELS, ...SERVICE_AUDITED_ENTITIES}, "module"));
export const AUDITED_ENTITY_TYPES = Object.keys({...AUDITED_MODELS, ...SERVICE_AUDITED_ENTITIES});

// Bookkeeping fields that are never shown as changes
export const UNLOGGED_FIELDS = ["id", "createdAt", "updatedAt", "deletedAt", "lastLoginAt", "tokenVersion"];

// Logged only as "***", never with their value
export const SECRET_FIELDS = ["passwordHash"];

// Changed fields that hold a user id: the audit log and the Activity tab add the user's name next to it
export const USER_ID_FIELDS = [
    "assignedOfficerId",
    "reviewerId",
    "defaultReviewerId",
    "assignedBy",
    "createdBy",
    "decidedBy",
    "generatedBy",
    "overriddenBy",
    "requestedBy",
    "resolvedBy",
    "reviewedBy",
    "sentBy",
    "submittedBy",
    "triggeredBy",
    "uploadedBy",
];
