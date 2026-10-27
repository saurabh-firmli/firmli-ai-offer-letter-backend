# Frontend Guide: Firmli AI Offer Letter API (part 03)

Parts: [01 — basics, login, users, roles, programs, campuses, locations](frontend-guide-01.md) · [02 — letter templates, email templates, eligibility, dashboard, applications](frontend-guide-02.md) · [03 — manual review queue, decisions, AI assessment, letters, communications, notes, extract, notifications, activity](frontend-guide-03.md) · [04 — live updates, branding, dropdowns](frontend-guide-04.md) · [05 — settings, reports, AI usage, audit logs, Firmli staff (switch user, platform panel)](frontend-guide-05.md). This is part 03.

Base URL, the token, the response format, errors, status codes and the `api()` helper used below are in [part 01](frontend-guide-01.md).

## Endpoints (continued)

### Manual Review Queue

Applications the AI could not decide alone wait here for a person. Each one is a **review case**: the AI opens it with a reason, flags and a priority, and people assign it, ask the student for documents, or return it to the AI. Needs the **Manual Review** permission (`reviews`): by default every role can see the queue, and every role except Read Only can act on it.

| Method | Path | What it does | Permission |
|---|---|---|---|
| `GET` | `/v1/reviews/options` | Dropdown values: statuses, priorities, flags, reviewers | read |
| `GET` | `/v1/reviews` | The queue, paginated, with filters and counts per status | read |
| `GET` | `/v1/reviews/:id` | One case, with the missing documents and past document requests | read |
| `PUT` | `/v1/reviews/:id/assignment` | **Assign** (or reassign) a reviewer: `{reviewerId, priority, note}` | update |
| `POST` | `/v1/reviews/:id/notes` | **Add review note**: `{note}`, see [Notes](#notes) | update |
| `PUT` | `/v1/reviews/:id/criteria/:criterionId` | **Override** a criterion result: `{result, note}`, see [Decisions](#decisions) | update |
| `POST` | `/v1/reviews/:id/decision` | **Approve / Reject**: `{outcome, reason}`, see [Decisions](#decisions) | update |
| `POST` | `/v1/reviews/:id/request-documents` | **Request documents** from the student: `{documentTypeIds, message}` | update |
| `POST` | `/v1/reviews/:id/return-for-reassessment` | **Return for reassessment**: `{note}` | update |

Show the action buttons only with `can(user, "reviews", "update")`. Assign, request documents, override, decide and return work on open cases only; a resolved case answers `409` `"This review is already resolved"`. Notes can be added to any case.

#### Status and priority

| `status` | Label | When |
|---|---|---|
| `unassigned` | Unassigned | The AI opened the case and nobody has it (with a default reviewer in Settings it starts `assigned`) |
| `assigned` | Assigned | A reviewer was assigned (also after a reassign) |
| `in_review` | In Review | The reviewer is working on it, e.g. a requested document was uploaded |
| `waiting_documents` | Waiting for Documents | Documents were requested from the student; back to `in_review` as soon as a document is uploaded |
| `resolved` | Resolved | Done: `resolution` is `approved` (conditional offer), `rejected`, or `returned_for_reassessment`; labels in `options.resolutions` |

`priority`: `urgent`, `high`, `normal` (default), `low`.

The queue is ordered for work: open cases first (unassigned, assigned, in review, waiting for documents, then resolved), within that the highest priority first, then the longest waiting.

#### `GET /v1/reviews`

| Param | Notes |
|---|---|
| `page`, `limit` | Default `1` and `20`, `limit` max `100` |
| `status` | The **All / Unassigned / Assigned / In Review / Waiting for Documents / Resolved** dropdown |
| `priority`, `reviewerId`, `programId` | Optional filters |
| `mine` | `true` = only cases assigned to the logged in user ("My reviews") |
| `search` | Part of the application number, the student's name or email |

Response `data`: `{items, total, page, limit, counts}`. `counts` has every status, e.g. `{"unassigned": 4, "assigned": 1, "in_review": 2, "waiting_documents": 1, "resolved": 9}`, for badges on the dropdown; it follows the other filters but not `status`.

One item:

```json
{
  "id": 4,
  "status": "unassigned",
  "priority": "urgent",
  "reason": "Low confidence in document extraction",
  "flags": [{"code": "low_confidence", "label": "Low confidence"}, {"code": "unreadable_document", "label": "Unreadable document"}],
  "missingDocuments": 3,
  "confidence": 0.38,
  "queuedAt": "2026-09-12T10:00:00.000Z",
  "queueSeconds": 3628800,
  "reviewer": null,
  "assignedAt": null,
  "resolution": null,
  "resolutionNote": null,
  "resolvedAt": null,
  "resolvedBy": null,
  "application": {"id": 21, "applicationNumber": "APP-14551705", "status": "manual_review"},
  "student": {"id": 9, "name": "Sofia Garcia"},
  "program": {"id": 50, "name": "MSc Data Science"}
}
```

| Column | Field |
|---|---|
| App # | `application.applicationNumber` (link to the application) |
| Student, Program | `student.name`, `program.name` |
| Reason | `reason` (can be `null`: show "—") |
| Flagged | `flags[].label` as small badges; `[]` = "—" |
| Missing Docs | `missingDocuments`: required documents without a file; `0` = "—" |
| Confidence | `confidence` `0` to `1` (`0.38` → **38%**), `null` = "—" |
| Priority | `priority` |
| Reviewer | `reviewer.name`, or **Unassigned** when `null` |
| Queue Time | `queueSeconds` (time waiting; stops when resolved) → e.g. "41d 3h". `queuedAt` is when it entered the queue |
| Status | `status` |

```js
const formatQueueTime = (seconds) => {
  const days = Math.floor(seconds / 86400), hours = Math.floor((seconds % 86400) / 3600), minutes = Math.floor((seconds % 3600) / 60);
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`;
};
```

#### `GET /v1/reviews/options`

```json
{
  "statuses": [{"value": "unassigned", "label": "Unassigned"}],
  "resolutions": [{"value": "approved", "label": "Approved (conditional offer)"}],
  "priorities": [{"value": "urgent", "label": "Urgent"}, {"value": "normal", "label": "Normal"}],
  "flags": [{"value": "low_confidence", "label": "Low confidence"}],
  "reviewers": [{"id": 30, "name": "Riya Kapoor", "email": "riya.apex@yopmail.com", "roleName": "Admissions Officer"}]
}
```

`reviewers` are the users who can log in and whose role may work on manual reviews: use them for the **Reviewer** dropdown of the Assign dialog.

#### Assign: `PUT /v1/reviews/:id/assignment`

The **Assign Reviewer** dialog. `reviewerId` is required (from `options.reviewers`); `priority` and `note` (**Assignment Note**, max 2000) are optional, and a priority not sent stays as it is.

```js
await api(`/reviews/${review.id}/assignment`, {method: "PUT", body: {reviewerId: 30, priority: "high", note: "Please check the GPA"}});
```

The case becomes `assigned` (also when it was `in_review` or `waiting_documents`: a new reviewer starts fresh). The response `data` is the case as in `GET /v1/reviews/:id`. A user who cannot work on reviews answers `422` `{ "reviewerId": "Pick a user who can work on manual reviews" }`.

#### Request documents: `POST /v1/reviews/:id/request-documents`

The **Request document** action: pick the documents and write a message for the student.

```js
const review = await api(`/reviews/${review.id}/request-documents`, {
  method: "POST",
  body: {documentTypeIds: [1, 2], message: "Please send clear scans of both pages."},
});
// review.emailStatus: "sent" | "failed" | "not_configured"
```

- `documentTypeIds`: at least one id from `GET /v1/eligibility/options` → `documentTypes`. Preselect the case's `missingDocumentTypes`.
- `message`: optional, max 2000. It goes into the email as written.
- The student gets an email listing the documents (by their labels) and the message, from your institution's email sender (Settings), with your contact email as reply-to.
- The request is **recorded even if the email could not go out**. `emailStatus` and the response `message` tell you: `"Documents requested; the student was emailed"`, `"... but the email to the student could not be sent"`, or `"... but email is not configured, so the student was not emailed"`. Show a warning for the last two.
- The case moves to `waiting_documents`. If nobody had it, it is assigned to the user who made the request.
- When the documents arrive, upload them to the application: uploads are allowed while it is in manual review (see [Applications → Documents](frontend-guide-02.md#documents)). The first upload moves the case back to `in_review`, so it shows again in the reviewer's "assigned to you" count.

#### Return for reassessment: `POST /v1/reviews/:id/return-for-reassessment`

The **Return for reassessment** action: send the application back to the AI, e.g. after the missing documents were uploaded. Body `{note}`, optional (max 2000).

- The case is **resolved** (`resolution`: `returned_for_reassessment`, with `resolutionNote`, `resolvedBy` and `resolvedAt`).
- The application goes back to `status` `submitted` and `assessmentStatus` `pending`; its `outcome` and `confidence` are cleared. The AI assessment picks it up again; if it still needs a person, a new case opens.

#### `GET /v1/reviews/:id`

The item above plus:

```json
{
  "studentEmail": "sofia@yopmail.com",
  "assignmentNote": "Please check the GPA",
  "missingDocumentTypes": [{"documentTypeId": 1, "label": "Passport"}, {"documentTypeId": 2, "label": "Bachelor's Transcript"}],
  "documentRequests": [
    {"id": 3, "documentTypeIds": [1, 2], "message": "Please send clear scans.", "emailStatus": "sent",
     "requestedBy": {"id": 30, "name": "Riya Kapoor"}, "createdAt": "2026-10-24T11:00:00.000Z"}
  ],
  "notes": [
    {"id": 7, "reviewId": 12, "note": "GPA fine; waiting for IELTS.", "createdBy": {"id": 30, "name": "Riya Kapoor"}, "createdAt": "2026-10-24T11:05:00.000Z"}
  ]
}
```

`documentRequests` and `notes` are newest first. `notes` are all notes of the application, also those added on its page or on earlier cases (`reviewId` tells which case, `null` for the application page).

#### Review errors

| Status | When | Body |
|---|---|---|
| `422` | A field is invalid or missing | `errors` = `{ field: message }` |
| `422` | Reviewer cannot work on reviews, is blocked or not in your institution | `{ "reviewerId": "Pick a user who can work on manual reviews" }` |
| `422` | Unknown document type | `{ "documentTypeIds": "Document types not found: 99" }` |
| `409` | Any action on a resolved case | `message`: `"This review is already resolved"` |
| `403` | No Manual Review permission | `errors[0].message`: `"You do not have permission to update reviews"` |
| `404` | No case with that id in your institution | `message`: `"Review not found"` |

Every action is in the [audit log](frontend-guide-05.md#audit-logs) under module `reviews` (`manualReview`, `applicationDocumentRequest` and, for overrides, `assessmentCriterion` entries); notes under module `applications` (`applicationNote`).

### Decisions

People can decide where the AI could not, or change what it decided. Every decision needs a **reason**, and the application shows who decided:

```json
"decision": {"source": "manual", "by": {"id": 30, "name": "Riya Kapoor"}, "at": "2026-10-25T09:10:00.000Z", "reason": "All met after checking the IELTS original"}
```

`source` is `ai` when the AI assessment decided (`by` and `reason` `null`), `manual` when a person did. `decision` is `null` while nothing is decided, and is cleared when the application goes back to the AI.

#### Override a criterion: `PUT /v1/reviews/:id/criteria/:criterionId`

On the case's **Assessment** view, a reviewer sets their own result for a criterion of the latest completed run, e.g. after checking an original document. `criterionId` is `criteria[].criterionId` of the run.

```js
const run = await api(`/reviews/${review.id}/criteria/${criterion.criterionId}`, {
  method: "PUT",
  body: {result: "met", note: "Saw the original IELTS certificate: 7.0"},
});
// run.suggestedOutcome: "conditional_offer"
```

- `result`: `met` or `not_met`, with a `note` (required, max 2000). `{result: null}` removes the override.
- The AI's `result` stays; show both, e.g. "AI: Unclear · Reviewer: Met". The response is the run, as in `GET /v1/applications/:id/assessment`.
- An override does **not** decide: use `suggestedOutcome` to preselect the decision below.
- `404` `"Criterion not found in the latest assessment"`; `409` `"This application has no completed assessment"`.

#### Approve / Reject: `POST /v1/reviews/:id/decision`

```js
await api(`/reviews/${review.id}/decision`, {method: "POST", body: {outcome: "conditional_offer", reason: "All met after checking the IELTS original"}});
```

- `outcome`: `conditional_offer` (**Approve**) or `rejection` (**Reject**). `reason`: required, max 2000.
- The case is **resolved** (`resolution` `approved` / `rejected`, `resolutionNote` = the reason). The application becomes `completed` with that `outcome` and a `manual` decision.
- The response `data` is the case, as in `GET /v1/reviews/:id`.

#### Change outcome: `PUT /v1/applications/:id/outcome`

**Change outcome** on a decided application (status `completed`), e.g. when an offer must be withdrawn. Needs Applications update.

```js
const application = await api(`/applications/${id}/outcome`, {method: "PUT", body: {outcome: "rejection", reason: "Transcript found to be forged"}});
```

- `outcome`: `conditional_offer` or `rejection`; `reason` required (max 2000). Answers the application.
- The same as the current outcome: `422` `{ "outcome": "This is already the outcome" }`. In manual review: `409` "... decide it in the Manual Review Queue". Any other status: `409` `"Only a decided application's outcome can be changed"`.
- The previous outcome stays in the [Activity](#activity-tab) and the audit log.

### AI Assessment (Run Assessment)

The AI reviews a submitted application: it **reads every document**, then **finds the applicant's value for each eligibility criterion** (e.g. GPA 3.62, IELTS 7.0) with the evidence. The backend compares those values with the criteria and decides with your Settings rules. Each run uses your institution's own OpenAI key (Settings) and is logged in [AI Usage](frontend-guide-05.md#ai-usage).

| Method | Path | What it does | Permission |
|---|---|---|---|
| `POST` | `/v1/applications/:id/assess` | **Run Assessment**. Answers `202` at once; the run continues in the background | Applications create |
| `GET` | `/v1/applications/:id/assessment` | The latest run with all its results (`null` if never assessed) | Applications read |
| `GET` | `/v1/applications/:id/assessments` | Every run, newest first: `[{id, status, outcome, confidence, startedAt, completedAt, costUsd}]` | Applications read |
| `GET` | `/v1/applications/assessments/:id` | One run with all its results | Applications read |

**When it runs**
- **Automatically** when an application is submitted, and after **Return for reassessment**, if **Automatic assessment** is on in Settings and an OpenAI key is saved.
- **By hand** with the **Run Assessment** action (e.g. after a failed run).
- Not for a draft, not while a run is going, and not while the application has an open Manual Review case (`409`, see errors).

**While it runs** the application shows `status` `processing` and `assessmentStatus` `in_progress`. Wait for the `assessment.updated` live event ([part 04](frontend-guide-04.md)), then fetch `GET /v1/applications/:id/assessment`; without live updates, poll it every few seconds until its `status` is no longer `in_progress` (a run takes about 10–60 seconds, longer when many are queued or the AI is busy: it is retried for a few minutes before it fails).

**How it decides** (mandatory criteria decide; optional ones are shown but do not decide):

| Result | Outcome |
|---|---|
| Every mandatory criterion met | `conditional_offer` → application `completed` |
| A mandatory criterion not met | `rejection` → application `completed` |
| A mandatory criterion without a clear value | `manual_review` with "Require manual review for edge cases" on; off: `rejection` |
| No mandatory criterion in force on the application date (all optional, or expired) | `manual_review`, flag `no_mandatory_criteria`: never an offer on its own |
| Confidence below the offer / rejection threshold (Settings, with "Flag low-confidence assessments" on), a required document missing ("Flag missing documents"), a document that is not its declared type, or an unreadable document | `manual_review` |

`manual_review` puts the application in `manual_review` and **opens a case** in the [Manual Review Queue](#manual-review-queue) with the reason and flags (assigned to the Settings default reviewer, if any). A failed run puts the application back to `submitted` with `assessmentStatus` `failed`; run it again.

#### A run, as returned by `GET /v1/applications/:id/assessment`

```json
{
  "id": 41, "applicationId": 85, "status": "completed",
  "outcome": "conditional_offer", "confidence": 0.99,
  "summary": "All 2 mandatory criteria met",
  "flags": [],
  "escalated": false,
  "errorMessage": null,
  "eligibilityVersion": 1,
  "startedAt": "2026-10-24T17:53:20.000Z", "completedAt": "2026-10-24T17:53:41.000Z",
  "costUsd": null, "tokens": 2950,
  "triggeredBy": {"id": 5, "name": "Riya"},
  "criteria": [
    {"criterionId": 161, "name": "Minimum GPA", "isMandatory": true, "result": "met",
     "foundValue": "3.62", "operator": "greater_than_or_equal", "requiredValue": "3.0", "unit": "GPA on a 4.0 scale", "dataType": "number",
     "evidence": "Page 1: \"Cumulative GPA: 3.62 / 4.00\"", "sourceDocumentId": 129, "confidence": 0.99,
     "reasoning": "The transcript reports a cumulative GPA of 3.62 on a 4.00 scale.",
     "override": null, "finalResult": "met"}
  ],
  "suggestedOutcome": "conditional_offer",
  "documents": [
    {"documentId": 129, "originalName": "transcript.pdf", "documentType": "Academic Transcript", "status": "completed",
     "detectedType": "Official academic transcript", "typeMatches": true, "confidence": 0.98, "modelCode": "gpt-5.6-luna",
     "fields": [{"name": "Cumulative GPA", "value": "3.62 / 4.00", "confidence": 0.99, "evidence": "Page 1"}], "errorMessage": null}
  ]
}
```

- `criteria[].result`: the AI's `met`, `not_met` or `unclear` (no clear value). Show it as e.g. **3.62 ≥ 3.0 ✓** from `foundValue`, `operator` and `requiredValue`, with `evidence` and a link to the source document (`sourceDocumentId`).
- `criteria[].override`: a reviewer's own result, `{result, note, by, at}`, or `null`; `finalResult` is the override's result, else the AI's. `suggestedOutcome` is what the mandatory criteria say with the overrides (see [Decisions](#decisions)).
- `documents[]`: what the AI read from each file. `status` `unsupported` / `failed` with `errorMessage` when a file could not be read; `typeMatches` `false` when it is not the declared type (`null` when "Verify document type" is off).
- `flags`: `[{code, label}]`, review queue codes (`low_confidence`, `missing_documents`, `document_mismatch`, `unreadable_document`, `no_mandatory_criteria`). `GET /v1/reviews/options` also lists `conflicting_data`, which a run does not raise yet.
- `escalated`: `true` when the escalation model checked it again because the first answer was unsure. Documents the extraction model was unsure about are read again by the fallback model.
- `costUsd` / `tokens`: the AI cost of this run (`costUsd` is `null` until model prices are set).
- On `failed`, `errorMessage` says why, e.g. `"Incorrect API key provided: sk-***...cdef"`.

#### Assessment errors

| Status | When | `message` |
|---|---|---|
| `409` | No OpenAI key in Settings | `"Add your institution's OpenAI API key in Settings first"` |
| `409` | The application is a draft | `"Submit the application before assessing it"` |
| `409` | A run is already going | `"An assessment of this application is already running"` |
| `409` | It is in manual review | `"This application is in manual review; return it for reassessment first"` |
| `503` | The run could not be queued (the job queue is down) | `"The assessment could not be started, please try again"` |
| `404` | No application or run with that id in your institution | `"Application not found"` / `"Assessment not found"` |

PDF, JPG and PNG files go to the AI as they are; a DOCX is read as text. The prompts can be replaced in Settings (`extractionPrompt`, `assessmentPrompt`); the built-in ones are used when they are empty.

### Letters

**Generate Letter** fills the program's letter template for the outcome with the application's data, saves it with a **PDF**, and, depending on Settings, approves it at once or waits for a person. Needs the **Letters** permission (`letters`): by default Super Admin and Institution Admin can generate and approve, Admissions Officers can generate, everyone can see and download.

| Method | Path | What it does | Permission |
|---|---|---|---|
| `POST` | `/v1/applications/:id/letters` | **Generate Letter** | Applications create + Letters create |
| `GET` | `/v1/applications/:id/letters` | The application's letters, newest first (replaced ones too) | Applications read + Letters read |
| `GET` | `/v1/letters` | Letters for an approvals page, paginated | Letters read |
| `GET` | `/v1/letters/options` | `statuses` and `letterTypes` with labels | Letters read |
| `GET` | `/v1/letters/:id` | One letter with its HTML | Letters read |
| `GET` | `/v1/letters/:id/download-url` | **Download PDF**: `{url, expiresIn}`, a short-lived link; `?inline=true` to show it (**View**) | Letters read |
| `POST` | `/v1/letters/:id/approve` | **Approve**: `{note}` optional | Letters update |
| `POST` | `/v1/letters/:id/reject` | **Reject**: `{note}` required | Letters update |
| `GET` | `/v1/letter-templates/:id/preview?applicationId=` | Preview a template with a real application, nothing saved | Letter Templates read |

#### Which letter, which template

| Application | Letter | Program field |
|---|---|---|
| `completed`, outcome `conditional_offer` | Conditional Offer | `conditionalOfferTemplateId` |
| `completed`, outcome `rejection` | Rejection | `rejectionTemplateId` |
| `manual_review` | Manual Review ("your application is being reviewed") | `manualReviewTemplateId` |

Any other status: `409` `"A letter can be generated once the application is decided or in manual review"`. Two people generating at the same moment: `409` `"This letter was just generated by someone else; refresh to see it"`. No template on the program: `409` `"Pick a Rejection letter template on the program first"`; a draft template: `409` `"The program's Manual Review letter template is a draft; publish it first"`.

#### Status and approval

| `status` | Label | When |
|---|---|---|
| `pending_approval` | Waiting for Approval | Generated; a person with Letters update approves or rejects it |
| `approved` | Approved | By a person, or at once by Settings (`reviewNote` "Approved automatically (Settings)", `reviewedBy` `null`) |
| `rejected` | Rejected | By a person, with the reason in `reviewNote`; fix the template or data and generate again |
| `superseded` | Replaced | A newer letter was generated, or the decision changed (Change outcome, a Manual Review decision, a new assessment, return for reassessment) |

**Automatic:** with **Automatic letter generation** on (Settings), the letter is generated by itself once the application is decided, by the AI or a person (`generatedBy` is who made the decision, or who started the AI run that decided). If it cannot be made (no template on the program, a draft template), nothing happens: the application has no `letter` and someone can generate it by hand.

Approved at once: an **offer** with **Auto-approve offers** on; a **rejection** with **Auto-approve rejections** on and **Require approval for rejections** off. Manual Review letters always wait. An application has **one current letter** (the newest that is not replaced): it is the `letter` of `GET /v1/applications/:id`.

#### A letter

```json
{
  "id": 7, "referenceNumber": "OFR-37829249-1", "letterType": "conditional_offer", "version": 1,
  "status": "pending_approval", "subject": "Offer for Amara O'Brien",
  "application": {"id": 85, "applicationNumber": "APP-37829249"},
  "student": {"name": "Amara O'Brien", "email": "amara@yopmail.com"},
  "program": {"id": 50, "name": "MSc Data Science"},
  "template": {"id": 12, "name": "Standard Offer"},
  "assessmentId": 41, "pdfSizeBytes": 23946,
  "generatedBy": {"id": 5, "name": "Riya"}, "createdAt": "2026-10-25T09:15:00.000Z",
  "reviewedBy": null, "reviewedAt": null, "reviewNote": null, "email": null,
  "headerHtml": "<p><b>Apex Study Abroad</b></p>", "bodyHtml": "<p>Dear Amara O&#39;Brien,</p>...", "footerHtml": "<p>...</p>"
}
```

- `referenceNumber`: the template's **Letter Reference Prefix**, the application number's digits, and the version (`OFR-37829249-2` after generating again).
- **View**: show the PDF itself (logo, colours, layout as the student gets it): `GET /v1/letters/:id/download-url?inline=true` gives a link the browser displays instead of downloading; put it in `<iframe src={url}>` with an "Open in new tab" button (phones may show only page 1 in an iframe). The link expires (`expiresIn`): ask for a new one each time the view opens.
- `headerHtml` / `bodyHtml` / `footerHtml` (only in `GET /v1/letters/:id` and the generate answer) are the template filled in, without the letterhead: not for **View**. They contain the template's own HTML, so **sanitize** (e.g. DOMPurify) if you show them.
- `subject` is plain text: show it as text.

#### Filling the template

Every `{{variable}}` is replaced; values are escaped, so a student name like `O'Brien & Sons` is safe. Values the backend builds:

| Variable | Value |
|---|---|
| `decision_date` | When the outcome was decided, e.g. "25 October 2026" |
| `offer_expiry_date` | Decision date + 30 days |
| `eligibility_table` | "Not assessed yet" without a completed run, else a table: Requirement, Required standard ("Between 6.5 and 9"), Your result, Met (Yes / No / Not shown), Your action (not in rejections). Latest assessment with overrides; never says AI |
| `document_checklist` | Table: Document, Required, Received, Status (Verified / Received / Missing / Does not match its type), File name, Your action |
| `conditions` | A list: required documents missing or of the wrong kind ("Submit your English Language Certificate"), optional criteria not met or not shown; else "None" |
| `unmet_requirements` | Mandatory criteria not met (their rejection reason) or not shown, plus a person's decision reason; a rejection never says "None" |
| `missing_documents` | Required documents without a file, or sent as the wrong kind of document |
| `signatory_name`, `signatory_title` | From the template |

**PDF:** A4, the template's header on every page, the footer with "Page 1 of 2". Supported in templates: paragraphs, headings, bold / italic / underline, lists, tables, colours and font sizes in inline `style`, and images as **inline PNG / JPEG data** (`<img src="data:image/png;base64,...">`). Images by URL are left out, and layout CSS (flex, grid, floats) is ignored.

#### Approve / Reject

```js
await api(`/letters/${letter.id}/approve`, {method: "POST", body: {note: "Looks good"}});
await api(`/letters/${letter.id}/reject`, {method: "POST", body: {note: "Wrong intake on the letter"}});
```

Only a `pending_approval` letter: otherwise `409` `"Only a letter waiting for approval can be approved or rejected"`. Both answer the letter.

#### `GET /v1/letters`

Query: `page`, `limit`, `status`, `letterType`, `programId`, `search` (reference, application number or student name). Without `status` it lists current letters (not replaced ones). Response `data`: `{items, total, page, limit, counts}`; `counts` has every status for the chips, e.g. `{"pending_approval": 3, "approved": 12, "rejected": 1, "superseded": 4}`.

#### Preview a template

`GET /v1/letter-templates/:id/preview?applicationId=85` answers `{subject, headerHtml, bodyHtml, footerHtml}` filled with that application's data, for the template editor's **Preview** (any status and type). Nothing is saved.

### Communications (emails to students)

**Send Email** emails an approved letter to the student, with the program's email template and the PDF attached; every email to a student is kept in a log for the **Communications** page, with automatic retries. Needs the **Communications** permission (`communications`): by default Super Admin, Institution Admin and Admissions Officer can send and retry, everyone can read the log.

| Method | Path | What it does | Permission |
|---|---|---|---|
| `POST` | `/v1/letters/:id/send` | **Send Email**: `{templateId}` optional | Communications create |
| `GET` | `/v1/emails` | The log, newest first, paginated | Communications read |
| `GET` | `/v1/emails/options` | `statuses` and `emailTypes` with labels | Communications read |
| `GET` | `/v1/emails/:id` | One email with its `bodyHtml` / `bodyText`, as sent | Communications read |
| `POST` | `/v1/emails/:id/retry` | **Retry** a failed (or waiting) email now | Communications update |
| `GET` | `/v1/applications/:id/emails` | The application's emails (the **Comms** tab), the newest 100: `{items, total, page, limit, counts}` | Applications read + Communications read |

#### Send Email: `POST /v1/letters/:id/send`

```js
const email = await api(`/letters/${letter.id}/send`, {method: "POST", body: {}});
// email.status: "sent" | "retrying" | "failed"
```

- Only an **approved** letter: otherwise `409` `"Only an approved letter can be emailed"`.
- The template: the program's **Offer Email** / **Rejection Email** for that letter type, or `templateId` (a published email template of the letter's type; needed for Manual Review letters, which have no program field; another type answers `422` `{ "templateId": "Pick a Conditional Offer email template" }`). Missing: `409` `"Pick a Conditional Offer email template on the program, or send templateId"`; a draft: `409` "... is a draft; publish it first".
- The subject and body are filled with the same `{{variables}}` as letters. To: the student; cc / bcc from the template; reply-to: your contact email (Settings). **Attach PDF Letter** on the template attaches the letter's PDF (`OFR-37829249-1.pdf`).
- Answers `201` with the logged email, and a `message`: `"Email sent"`, `"The email could not be sent yet; it will be retried"` or `"The email could not be sent"`. Show a warning for the last two.
- Sending again sends a new email (each one is logged).
- **Automatic:** with **Automatic email dispatch** on, an approved letter (by a person or by Settings) is sent by itself.

#### Statuses and retries

| `status` | Label | When |
|---|---|---|
| `sending` | Sending | Being sent right now |
| `sent` | Sent | Delivered to the mail server (`sentAt`, `sender`: `custom` = your SMTP, `default` = Firmli's) |
| `retrying` | Retrying | A try failed; the next one is at `nextRetryAt` |
| `failed` | Failed | Every try failed (`lastError` says why); **Retry** sends it again |

A failed send is tried again by itself, 5, 10, 20 ... minutes later (at most 6 hours apart), up to `maxAttempts` = 1 + **Max Retry Attempts** (Settings). `attempts` counts the tries. Without any mail server (`lastError` `"Email is not configured"`) it fails at once. **Retry** by hand also works after the last attempt; only a `sent` or `sending` email answers `409` `"Only a failed or waiting email can be retried"`.

#### An email

```json
{
  "id": 31, "emailType": "conditional_offer", "status": "sent",
  "recipient": "amara@yopmail.com", "cc": "admissions@yopmail.com", "bcc": null,
  "subject": "Your offer APP-37829249",
  "application": {"id": 85, "applicationNumber": "APP-37829249"},
  "letter": {"id": 7, "referenceNumber": "OFR-37829249-1"}, "attachLetter": true,
  "template": {"id": 4, "name": "Offer Email"},
  "attempts": 1, "maxAttempts": 4, "lastError": null, "nextRetryAt": null,
  "sentAt": "2026-10-25T09:31:08.000Z", "sender": "default",
  "sentBy": {"id": 5, "name": "Riya"}, "createdAt": "2026-10-25T09:31:08.000Z"
}
```

- `emailType`: `conditional_offer`, `rejection`, `manual_review`, `document_request` (the Manual Review Queue's **Request documents**, logged here too) or `custom`.
- For an automatic email `sentBy` is the user whose approval (or decision) triggered it; `null` only when there was none.
- Every letter (lists too) carries its latest email as `email: {id, status, sentAt}` or `null`, and an application's current `letter` has `emailStatus` (`null` = not emailed).

#### `GET /v1/emails`

Query: `page`, `limit`, `status`, `emailType`, `applicationId`, `search` (recipient, subject or application number). Response `data`: `{items, total, page, limit, counts}`; `counts` has every status for the chips, e.g. `{"sending": 0, "sent": 14, "retrying": 1, "failed": 1}`.

### Notes

Notes on an application: the **Add review note** action of a review case, and a notes list on the application page. A note is a record of the work, so it **cannot be edited or deleted**.

| Method | Path | What it does | Permission |
|---|---|---|---|
| `GET` | `/v1/applications/:id/notes` | All notes of the application, newest first | Applications read |
| `POST` | `/v1/applications/:id/notes` | Add a note from the application page: `{note}` | Applications create |
| `POST` | `/v1/reviews/:id/notes` | Add a note on a review case: `{note}` | Manual Review update |

```js
const note = await api(`/reviews/${review.id}/notes`, {method: "POST", body: {note: "GPA fine; waiting for IELTS."}});
```

- `note`: 1 to 5000 characters, trimmed. Empty or too long: `422` with `errors.note`.
- Answers `201` with the note: `{id, reviewId, note, createdBy: {id, name}, createdAt}`. `reviewId` is the case it was added on, `null` from the application page.
- Reviewers have no Applications create permission by default, so they add notes on the case; the notes show on the application too.
- Any status, and on resolved cases too. Another institution's application or case: `404`.

### Extract one document

The **Extract** button on the Documents tab: the AI reads one document now and shows what it found, e.g. to check a document before submitting or after it was uploaded during manual review. It uses your OpenAI key and is logged in [AI Usage](frontend-guide-05.md#ai-usage) (operation `extraction`, and `extraction_fallback` when the fallback model reads it again, no assessment).

| Method | Path | What it does | Permission |
|---|---|---|---|
| `POST` | `/v1/applications/documents/:id/extract` | Read the document now | Applications create |
| `GET` | `/v1/applications/documents/:id/extraction` | The newest reading of the document (from a run or from Extract), `null` if never read | Applications read |

```js
const reading = await api(`/applications/documents/${document.id}/extract`, {method: "POST"}); // show a spinner: up to about a minute
```

The response `data` (and the `GET`) is one reading, in the same shape as `documents[]` of an [assessment run](#a-run-as-returned-by-get-v1applicationsidassessment), plus:

```json
{"id": 52, "assessmentId": null, "requestedBy": {"id": 5, "name": "Riya"}, "createdAt": "2026-10-25T08:35:10.000Z"}
```

- The AI looks for the fields of the program's criteria, as in a run (fallback model when unsure).
- It **never changes the application or its assessment**: a run reads every document again itself.
- Works in any status, a draft too. No OpenAI key: `409` `"Add your institution's OpenAI API key in Settings first"`. An unreadable file comes back with `status` `failed` / `unsupported` and `errorMessage`.

### Notifications (topbar bell)

`GET /v1/notifications`: what needs the user's attention, as counts. Any logged in user; each item shows only for roles that may see its module. Fetch it after an action and on live events ([part 04](frontend-guide-04.md)), and poll it every 60 seconds as a safety net.

```json
{
  "total": 3,
  "items": [
    {"code": "reviews_unassigned", "label": "Manual reviews waiting for a reviewer", "count": 1},
    {"code": "reviews_assigned_to_me", "label": "Manual reviews assigned to you", "count": 2},
    {"code": "letters_waiting", "label": "Letters waiting for approval", "count": 0},
    {"code": "emails_failed", "label": "Emails to students that failed", "count": 0},
    {"code": "assessments_failed", "label": "Assessments that failed", "count": 0},
    {"code": "assessments_pending", "label": "Submitted applications not assessed yet", "count": 0}
  ]
}
```

| `code` | Counts | Shown with | Open on click |
|---|---|---|---|
| `reviews_unassigned` | Open review cases with nobody assigned | Manual Review read | Manual Review Queue, status Unassigned |
| `reviews_assigned_to_me` | Cases assigned to the user, `assigned` or `in_review` (not while waiting for documents) | Manual Review update | Manual Review Queue, "mine" |
| `letters_waiting` | Letters waiting for approval | Letters update | Letters, status Waiting for Approval |
| `emails_failed` | Emails to students that failed for good | Communications update | Communications, status Failed |
| `assessments_failed` | Applications whose last assessment failed | Applications read | Applications, assessment status Failed |
| `assessments_pending` | Submitted applications not assessed yet | Applications read | Applications, status Submitted |

- Show `total` on the bell (hide it at 0) and the items with a count above 0 in the dropdown.
- New codes may be added later; show any item you get, by its `label`.

### Activity tab

`GET /v1/applications/:id/activity`: the whole history of one application, newest first, for its **Activity** tab. Needs Applications read. Everyone who may read the application sees all of it (the [Audit logs](frontend-guide-05.md#audit-logs) page still shows only the Super Admin other people's changes).

Query: `page`, `limit` (default `1`, `20`; max `100`). Response `data`: `{items, total, page, limit}`. One item:

```json
{
  "id": "audit-913-update",
  "at": "2026-10-25T09:10:00.000Z",
  "entityType": "manualReview",
  "entityId": 12,
  "action": "update",
  "title": "Review resolved: Approved (conditional offer)",
  "details": {"status": {"from": "in_review", "to": "resolved"}, "resolution": {"from": null, "to": "approved"}},
  "user": {"id": 30, "name": "Riya Kapoor"}
}
```

- Show `title`, `user.name` ("System" when `null`) and `at`. `details` is the from → to of the change (as in the audit log, user ids named) for an expandable row; for an assessment run it is `{outcome, confidence, summary, errorMessage}`.
- It covers the application, its student, documents, review cases, document requests, notes, criterion overrides, letters, emails to the student, and each assessment run (started, completed / failed).
- Titles, e.g.: "Application created", "Document uploaded: transcript.pdf", "Application submitted", "Status: Submitted → Processing", "Assessment started", "Assessment completed: Conditional Offer (99%)", "Sent to manual review", "Reviewer assigned", "Documents requested from the student", "Note added", "Criterion result overridden: IELTS overall band", "Review resolved: Approved (conditional offer)", "Outcome set by a person: Rejection", "Letter generated: OFR-37829249-1", "Letter approved: OFR-37829249-1", "Letter replaced: OFR-37829249-1", "Email sent: Your offer APP-37829249", "Email failed; it will be retried: ...".
