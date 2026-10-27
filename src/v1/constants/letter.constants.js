// A generated letter: waiting for a person, approved or rejected by one, or replaced by a newer letter
export const LETTER_STATUSES = {
    PENDING_APPROVAL: "pending_approval",
    APPROVED: "approved",
    REJECTED: "rejected",
    SUPERSEDED: "superseded",
};
export const LETTER_STATUS_LABELS = {
    pending_approval: "Waiting for Approval",
    approved: "Approved",
    rejected: "Rejected",
    superseded: "Replaced",
};

// An application's current letter has one of these; a newer letter or a changed decision marks it superseded
export const CURRENT_LETTER_STATUSES = [LETTER_STATUSES.PENDING_APPROVAL, LETTER_STATUSES.APPROVED, LETTER_STATUSES.REJECTED];

// {{offer_expiry_date}}: the decision date plus this many days (no Settings field for it yet)
export const OFFER_VALID_DAYS = 30;
