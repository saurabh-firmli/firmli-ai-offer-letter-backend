export const REVIEW_STATUSES = {
    UNASSIGNED: "unassigned",
    ASSIGNED: "assigned",
    IN_REVIEW: "in_review",
    WAITING_DOCUMENTS: "waiting_documents",
    RESOLVED: "resolved",
};
export const REVIEW_STATUS_LABELS = {
    unassigned: "Unassigned",
    assigned: "Assigned",
    in_review: "In Review",
    waiting_documents: "Waiting for Documents",
    resolved: "Resolved",
};

// Highest first: the queue shows urgent cases at the top
export const REVIEW_PRIORITY_LABELS = {urgent: "Urgent", high: "High", normal: "Normal", low: "Low"};
export const REVIEW_PRIORITIES = Object.keys(REVIEW_PRIORITY_LABELS);

export const REVIEW_RESOLUTIONS = {RETURNED_FOR_REASSESSMENT: "returned_for_reassessment", APPROVED: "approved", REJECTED: "rejected"};
export const REVIEW_RESOLUTION_LABELS = {
    returned_for_reassessment: "Returned for reassessment",
    approved: "Approved (conditional offer)",
    rejected: "Rejected",
};
// A decision on a case resolves it this way
export const RESOLUTION_BY_OUTCOME = {conditional_offer: "approved", rejection: "rejected"};

// A reviewer's own result for a criterion
export const CRITERION_OVERRIDE_RESULTS = ["met", "not_met"];

// Labels of the flags the AI assessment raises; an unknown flag is shown as it is
export const REVIEW_FLAG_LABELS = {
    low_confidence: "Low confidence",
    missing_documents: "Missing documents",
    document_mismatch: "Document does not match its type",
    conflicting_data: "Conflicting data across documents",
    unreadable_document: "Unreadable document",
    no_mandatory_criteria: "No mandatory criteria to check",
};

export const EMAIL_STATUSES = {SENT: "sent", FAILED: "failed", NOT_CONFIGURED: "not_configured"};
