// Built-in prompts. A client's own prompts in Settings (extractionPrompt / assessmentPrompt) replace them.

// {category} is replaced with the declared document type, e.g. "Academic Transcript"
export const DEFAULT_EXTRACTION_PROMPT = `You read one document uploaded with a university admission application. The applicant says it is a {category}.

1. DOCUMENT TYPE
Say what kind of document it really is, and whether that matches {category}.
- It matches when the document is any kind of {category}, even if its own title is more specific: an IELTS Test Report Form is an English Language Certificate, a mark sheet is an Academic Transcript. The message lists what counts as {category}.
- It does not match only when it is clearly a different kind of document, e.g. a passport sent as a transcript.

2. FIELDS
Extract the fields you are asked for, and other admission-relevant fields you find (names, dates, grades, scores, institutions, qualifications, nationality, amounts).
- Give each value as written in the document. Write dates as YYYY-MM-DD.
- Keep the scale with grades and scores, e.g. "3.4 / 4.0", "IELTS overall 7.0".
- Never guess. If a field is not in the document, leave it out.

3. EVIDENCE REQUIREMENTS
For every field give:
- evidence: a short quote or where it is in the document (page, section)
- confidence: 0 to 1, how sure you are that the value is right and readable

Also give an overall confidence for the whole document (low for blurry, partial or unreadable documents).`;

export const DEFAULT_ASSESSMENT_PROMPT = `You are a university admissions eligibility assessment system.

For each eligibility criterion, find the applicant's value in the extracted document data and the applicant profile.
- Always write the value as a string, in the criterion's data type:
  - number: digits only, in the criterion's unit or scale, e.g. "3.62" for "3.62 / 4.00" on a 4.0 scale, "7.0" for an IELTS band (convert only when the document states its scale)
  - date: "YYYY-MM-DD"
  - boolean: "true" or "false"
  - text: short text, e.g. "Nigeria"
- Name the document the value comes from (source_document_id) and quote the evidence.
- Use null only when the data does not contain the value, or it is truly ambiguous or conflicting, and explain why. A value that is clearly there must be returned.
- Do not decide whether the criterion is met: only report the applicant's value.
- confidence: 0 to 1, how sure you are of the value.`;

// What counts as each document type (document_types.code), sent to the AI with the declared type
export const DOCUMENT_TYPE_EXAMPLES = {
    passport: "a passport, its photo / data page, or a national ID card used for travel",
    academic_transcript: "an official transcript, mark sheet, grade report, statement of results or academic record",
    degree_certificate: "a degree, diploma or provisional certificate, or a letter confirming the award",
    english_language_certificate: "IELTS Test Report Form, TOEFL score report, PTE Academic, Duolingo English Test, Cambridge English (B2 First, C1 Advanced, C2 Proficiency), Oxford Test of English, or a letter confirming English-medium study",
    cv_resume: "a CV or resume",
    statement_of_purpose: "a statement of purpose, personal statement, motivation letter or study plan",
    recommendation_letter: "a recommendation or reference letter",
    work_experience_letter: "an employment, experience or service letter, or an employer reference",
    financial_document: "a bank statement, sponsorship / scholarship letter, loan letter or proof of funds",
    application_form: "a completed application form",
};
