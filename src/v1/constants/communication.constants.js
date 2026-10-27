// An email to a student: being sent, sent, waiting for its next try, or failed for good (can be retried by hand)
export const STUDENT_EMAIL_STATUSES = {SENDING: "sending", SENT: "sent", RETRYING: "retrying", FAILED: "failed"};
export const STUDENT_EMAIL_STATUS_LABELS = {sending: "Sending", sent: "Sent", retrying: "Retrying", failed: "Failed"};

// Retries wait longer each time: 5, 10, 20, 40 ... minutes, at most 6 hours
export const RETRY_FIRST_DELAY_MINUTES = 5;
export const RETRY_MAX_DELAY_MINUTES = 360;
// How often due retries are looked for, and how many are sent per round
export const RETRY_CHECK_SECONDS = 60;
export const RETRY_BATCH_SIZE = 20;
// An email still "sending" after this long was cut off (one try takes at most about a minute: SMTP timeouts
// 10 + 10 + 20 s, plus reading the files): it is tried again. Never sooner, or one being sent now would go twice
export const STUCK_SENDING_MINUTES = 10;
