export const APPLICATION_STATUSES = {DRAFT: "draft", SUBMITTED: "submitted", MANUAL_REVIEW: "manual_review", COMPLETED: "completed"};

// Who decided the outcome: the AI assessment, or a person (Manual Review decision, Change outcome)
export const DECISION_SOURCES = {AI: "ai", MANUAL: "manual"};
// The outcomes a person can decide; manual_review is only ever the AI's
export const DECISION_OUTCOMES = ["conditional_offer", "rejection"];
// Clears the decision when the application goes back to the AI
export const NO_DECISION = {outcome: null, confidence: null, decisionSource: null, decidedBy: null, decidedAt: null, decisionReason: null};
export const APPLICATION_STATUS_LABELS = {
    draft: "Draft",
    submitted: "Submitted",
    processing: "Processing",
    manual_review: "Manual Review",
    completed: "Completed",
};

// Filled by the AI assessment; outcome is one of the letter types
export const ASSESSMENT_STATUS_LABELS = {pending: "Pending", in_progress: "In Progress", completed: "Completed", failed: "Failed"};
export const ASSESSMENT_PENDING = "pending";

export const INTAKE_TERM_LABELS = {spring: "Spring", summer: "Summer", fall: "Fall", winter: "Winter"};
export const INTAKE_TERMS = Object.keys(INTAKE_TERM_LABELS);
// The Intake dropdown offers this year and the next ones
export const INTAKE_YEARS_AHEAD = 2;

export const GENDER_LABELS = {male: "Male", female: "Female", other: "Other", prefer_not_to_say: "Prefer not to say"};
export const GENDERS = Object.keys(GENDER_LABELS);

// Uploads: extension -> the MIME type the browser sends and the bytes the file must start with
export const MAX_UPLOAD_MB = 10;
export const UPLOAD_TYPES = {
    ".pdf": {mimeTypes: ["application/pdf"], signature: [0x25, 0x50, 0x44, 0x46]},
    ".docx": {mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"], signature: [0x50, 0x4b, 0x03, 0x04]},
    ".jpg": {mimeTypes: ["image/jpeg"], signature: [0xff, 0xd8, 0xff]},
    ".jpeg": {mimeTypes: ["image/jpeg"], signature: [0xff, 0xd8, 0xff]},
    ".png": {mimeTypes: ["image/png"], signature: [0x89, 0x50, 0x4e, 0x47]},
};
