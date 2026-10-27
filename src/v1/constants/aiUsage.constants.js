// What an AI call was for (ai_usage_logs.operation)
export const AI_OPERATION_LABELS = {
    extraction: "Document extraction",
    extraction_fallback: "Extraction (fallback model)",
    document_verification: "Document type check",
    assessment: "Eligibility assessment",
    assessment_escalation: "Assessment (escalation model)",
};
export const AI_OPERATIONS = Object.keys(AI_OPERATION_LABELS);

export const AI_USAGE_STATUSES = {SUCCESS: "success", FAILED: "failed"};

// The daily chart shows the last 30 days unless a period is picked
export const AI_USAGE_CHART_DAYS = 30;
