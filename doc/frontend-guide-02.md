# Frontend Guide: Firmli AI Offer Letter API (part 02)

Parts: [01 — basics, login, users, roles, programs, campuses, locations](frontend-guide-01.md) · [02 — letter templates, email templates, eligibility, dashboard, applications](frontend-guide-02.md) · [03 — manual review queue, decisions, AI assessment, letters, communications, notes, extract, notifications, activity](frontend-guide-03.md) · [04 — live updates, branding, dropdowns](frontend-guide-04.md) · [05 — settings, reports, AI usage, audit logs, Firmli staff (switch user, platform panel)](frontend-guide-05.md). This is part 02.

Base URL, the token, the response format, errors, status codes and the `api()` helper used below are in [part 01](frontend-guide-01.md).

## Endpoints (continued)

### Letter templates

The letters sent to students: one template per letter, of one of three types. Each tenant has its own templates. Programs pick which template to use for each type.

| Method | Path | What it does | Success |
|---|---|---|---|
| `GET` | `/v1/letter-templates/variables` | The `{{variables}}` a template may use, for the **Insert variable** dropdown | `200` |
| `GET` | `/v1/letter-templates` | List templates, sorted by name | `200` |
| `POST` | `/v1/letter-templates` | Create a template | `201` |
| `GET` | `/v1/letter-templates/:id` | Get one template, with `body`, `headerHtml` and `footerHtml` | `200` |
| `PATCH` | `/v1/letter-templates/:id` | Update some or all fields | `200` |
| `DELETE` | `/v1/letter-templates/:id` | Delete a template | `200` |
| `GET` | `/v1/letter-templates/:id/preview?applicationId=` | The template filled with a real application's data, see [Letters](frontend-guide-03.md#letters) | `200` |
| `GET` | `/v1/letter-templates/:id/preview-pdf?applicationId=` | The same as the **PDF** a student would get (letterhead, logo, brand colour); the file, not JSON: see [part 04](frontend-guide-04.md#letter-template-preview-as-pdf) | `200` |

#### Template fields

| Field | Type | Required on create | Notes |
|---|---|---|---|
| `name` | string, max 150 | yes | Template Name. Unique within your tenant (case-insensitive); other tenants can use the same name |
| `letterType` | enum | yes | `conditional_offer`, `rejection`, `manual_review` |
| `subject` | string, max 255 | no | May use variables |
| `referencePrefix` | string, 1 to 10 of `A-Z`, `0-9`, `-` | no | Letter Reference Prefix, default `"LTR"` (leave it out for that; `""` or `null` answer `422`). Stored in capitals (`"ofr"` becomes `"OFR"`) |
| `body` | string, max 200,000 | yes | The letter text or HTML. May use variables |
| `signatoryName` | string, max 150 | no | Authorized Signatory |
| `signatoryTitle` | string, max 150 | no | Signatory Title |
| `headerHtml` | string, max 20,000 | no | Header HTML. May use variables |
| `footerHtml` | string, max 20,000 | no | Footer HTML. May use variables |
| `status` | enum | no | `draft` (default) or `published` |

| `letterType` | Label | | `status` | Label |
|---|---|---|---|---|
| `conditional_offer` | Conditional Offer | | `draft` | Draft |
| `rejection` | Rejection | | `published` | Published |
| `manual_review` | Manual Review | | | |

- For optional fields, `""` or `null` means "not set". The API returns them as `null`.
- `body`, `headerHtml` and `footerHtml` are HTML written by your users. If you preview them in the app, sanitize the HTML first (e.g. DOMPurify) and never inject it unsanitized.

#### Variables

The list is the same for every tenant and is kept in the database, so new variables can appear without a frontend release. `GET /v1/letter-templates/variables` returns `[{key, label}]` in dropdown order, e.g. `{"key": "student_full_name", "label": "Student Full Name"}`. Use `label` in the dropdown and insert `{{key}}` at the cursor. Spaces inside the braces are allowed: `{{ student_full_name }}`.

Current keys, in dropdown order: `student_full_name`, `application_number`, `student_email`, `program_name`, `program_code`, `campus`, `intake`, `application_date`, `decision_date`, `offer_expiry_date`, `institution_name`, `institution_address`, `institution_website`, `eligibility_table`, `document_checklist`, `conditions`, `unmet_requirements`, `missing_documents`, `signatory_name` (Authorized Signatory), `signatory_title`. Always load the list from the API instead of hard-coding it.

`eligibility_table`, `document_checklist`, `conditions`, `unmet_requirements` and `missing_documents` become blocks of content (a table or a list), not a single word, so place them on a line of their own in the body.

Saving a template whose `subject`, `body`, `headerHtml` or `footerHtml` uses any other `{{name}}` answers `422`, e.g. `{ "body": "body uses unknown variables: student_name" }`, so a letter never goes out with an empty placeholder.

#### A template, as returned by the API

```json
{
  "id": 1,
  "tenantId": 1,
  "name": "Conditional Offer Template",
  "letterType": "conditional_offer",
  "subject": "Conditional Offer of Admission — {{program_name}}",
  "referencePrefix": "LTR",
  "signatoryName": "Admissions Office",
  "signatoryTitle": "Director of Admissions",
  "status": "draft",
  "createdAt": "2026-10-23T06:10:00.000Z",
  "updatedAt": "2026-10-23T06:10:00.000Z",
  "body": "Dear {{student_full_name}}, ...",
  "headerHtml": "<div style='text-align: center;'><img src='logo.png' /></div>",
  "footerHtml": null
}
```

The list (`GET /v1/letter-templates`) returns the same objects **without** `body`, `headerHtml` and `footerHtml`. Open a template with `GET /v1/letter-templates/:id` to edit it.

#### `GET /v1/letter-templates`

Optional query parameters: `letterType`, `status` and `search` (part of the name or subject). For a program's template dropdown, load only that type:

```js
const rejectionTemplates = await api("/letter-templates?letterType=rejection");
```

#### Rules and errors

- A program can only use a template of the matching type from your own tenant.
- A template used by a program cannot be deleted, and its `letterType` cannot change. Pick another template on those programs first.

| Status | When | Body |
|---|---|---|
| `422` | A field is invalid, a required field is missing, or the id is not a number | `errors` = `{ field: message }` |
| `422` | Unknown `{{variables}}` in subject, body, header or footer | `errors` = `{ "body": "body uses unknown variables: foo, bar" }` |
| `409` | The name already exists in your tenant | `message`: `"A letter template with this name already exists"` |
| `409` | Changing the type of a template that programs use | `message`: `"Template is used by programs, so its letter type cannot change"` |
| `409` | Deleting a template that programs use | `message`: `"Template is used by programs; pick another template on those programs first"` |
| `404` | No template with that id in your tenant | `message`: `"Letter template not found"` |

### Email templates

The emails sent to students. Each tenant has its own templates. A program picks the email to send for an offer and for a rejection.

| Method | Path | What it does | Success |
|---|---|---|---|
| `GET` | `/v1/email-templates/variables` | The `{{variables}}` for the **Insert variable** dropdown (the same list as [letter templates](#variables)) | `200` |
| `GET` | `/v1/email-templates` | List templates, sorted by name | `200` |
| `POST` | `/v1/email-templates` | Create a template | `201` |
| `GET` | `/v1/email-templates/:id` | Get one template, with `body` | `200` |
| `PATCH` | `/v1/email-templates/:id` | Update some or all fields | `200` |
| `DELETE` | `/v1/email-templates/:id` | Delete a template | `200` |

#### Email template fields

| Field | Type | Required on create | Notes |
|---|---|---|---|
| `name` | string, max 150 | yes | Template Name. Unique within your tenant (case-insensitive) |
| `emailType` | enum | yes | `conditional_offer`, `rejection`, `manual_review`, `document_request`, `custom` |
| `subject` | string, max 255 | no | May use variables |
| `cc` | string | no | One or more emails separated by commas or semicolons, max 20. Sent back cleaned up: lowercase, `", "` between them |
| `bcc` | string | no | Same as `cc` |
| `body` | string, max 200,000 | yes | May use variables |
| `attachPdfLetter` | boolean | no | **Attach PDF Letter.** Only for `conditional_offer`, `rejection` and `manual_review`, the types that have a letter. Default: `true` for those types, `false` otherwise |
| `status` | enum | no | `draft` (default) or `published` |

| `emailType` | Label | | `status` | Label |
|---|---|---|---|---|
| `conditional_offer` | Conditional Offer | | `draft` | Draft |
| `rejection` | Rejection | | `published` | Published |
| `manual_review` | Manual Review | | | |
| `document_request` | Document Request | | | |
| `custom` | Custom | | | |

- Hide or disable the **Attach PDF Letter** switch for Document Request and Custom. When the type changes to one of them, also send `attachPdfLetter: false`, or the API answers `422`.
- For optional fields, `""` or `null` means "not set". The API returns them as `null`.
- The body is HTML written by your users: sanitize it before any preview.

An email template, as returned by the API:

```json
{
  "id": 4,
  "tenantId": 1,
  "name": "Offer Email Template",
  "emailType": "conditional_offer",
  "subject": "Conditional Offer of Admission — {{program_name}}",
  "cc": "admissions@yopmail.com, registrar@yopmail.com",
  "bcc": null,
  "attachPdfLetter": true,
  "status": "draft",
  "createdAt": "2026-10-23T08:00:00.000Z",
  "updatedAt": "2026-10-23T08:00:00.000Z",
  "body": "Dear {{student_full_name}}, ..."
}
```

The list returns the same objects **without** `body`. Optional query parameters: `emailType`, `status` and `search` (part of the name or subject). For a program's dropdown, load only that type:

```js
const offerEmails = await api("/email-templates?emailType=conditional_offer");
```

#### Rules and errors

- On a program, `offerEmailTemplateId` takes a `conditional_offer` email template and `rejectionEmailTemplateId` a `rejection` one, from your own tenant.
- A template used by a program cannot be deleted, and its `emailType` cannot change.

| Status | When | Body |
|---|---|---|
| `422` | A field is invalid, a required field is missing, or the id is not a number | `errors` = `{ field: message }` |
| `422` | A bad address in `cc` / `bcc`, or more than 20 | `{ "cc": "cc has invalid emails: not-an-email" }`, `{ "bcc": "bcc can have at most 20 emails" }` |
| `422` | `attachPdfLetter: true` on a type without a letter | `{ "attachPdfLetter": "Only Conditional Offer, Rejection and Manual Review emails have a PDF letter to attach" }` |
| `422` | Unknown `{{variables}}` in subject or body | `{ "body": "body uses unknown variables: foo" }` |
| `409` | The name already exists in your tenant | `message`: `"An email template with this name already exists"` |
| `409` | Changing the type of a template that programs use | `message`: `"Template is used by programs, so its email type cannot change"` |
| `409` | Deleting a template that programs use | `message`: `"Template is used by programs; pick another template on those programs first"` |
| `404` | No template with that id in your tenant | `message`: `"Email template not found"` |

### Eligibility criteria

The admission rules a program checks. They are built once and reused: an **eligibility set** (e.g. "UK Masters Standard") holds the rules, and any number of programs use the same set. Each tenant has its own sets.

How it fits together:

- **Set:** a name and description. Assigned to programs, each program using at most one set.
- **Versions:** a set has versions v1, v2, ... with status `draft`, `published` or `archived`.
  - Only a **draft** can be changed. A published or archived version answers `409` to any change.
  - **Publish Version** makes the draft the live version; the previously published one becomes `archived`. Past decisions keep pointing at the rules they used.
  - **New Version** creates a draft copied from the published version (or the latest one). A set has at most one draft.
  - A new set starts with an empty draft, v1.
- **Criteria** and **document requirements** belong to a version.

Suggested screen: pick a **set** (instead of a program) and one of its versions, show the criteria table and document requirements of that version, and offer **Assign to programs** on the set.

#### Endpoints

All under `/v1/eligibility`.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/options` | Everything the forms' dropdowns need (below) |
| `GET` | `/sets` | Sets, sorted by name. Optional `?search=` |
| `POST` | `/sets` | Create a set: `{name, description}`. Starts with an empty draft v1 |
| `GET` | `/sets/:id` | One set with its `versions` (newest first) and assigned `programs` |
| `PATCH` | `/sets/:id` | Rename or change the description |
| `DELETE` | `/sets/:id` | Delete the set with all its versions. Refused (`409`) while programs use it |
| `PUT` | `/sets/:id/programs` | Set exactly which programs use this set: `{programIds: [1, 2]}` |
| `POST` | `/sets/:id/versions` | **New Version** |
| `GET` | `/versions/:id` | One version with its `criteria` and `documentRequirements` |
| `POST` | `/versions/:id/publish` | **Publish Version** (draft only, needs at least one criterion) |
| `POST` | `/versions/:id/copy-from` | **Duplicate From**: `{versionId}`. Replaces this draft's criteria and documents with a copy of another version's, from any of your sets |
| `DELETE` | `/versions/:id` | Discard a draft |
| `POST` | `/versions/:id/criteria` | Add a criterion to a draft |
| `PUT` | `/versions/:id/criteria/order` | Reorder: `{criterionIds: [...]}` listing every criterion of the version once |
| `PATCH` | `/criteria/:id` | Edit a criterion |
| `DELETE` | `/criteria/:id` | Delete a criterion |
| `POST` | `/versions/:id/documents` | Add a document requirement to a draft |
| `PATCH` | `/documents/:id` | Edit a document requirement, e.g. **Make Optional**: `{isRequired: false}` |
| `DELETE` | `/documents/:id` | Delete a document requirement |

`PUT /sets/:id/programs` sends the complete list: listed programs get this set (moving off any other set), programs no longer listed are left without a set, and `[]` unassigns all. A single program can also be changed with `eligibilitySetId` on the program form.

#### `GET /v1/eligibility/options`

```json
{
  "categories": [{"id": 1, "code": "academic_qualification", "label": "Academic Qualification"}],
  "documentTypes": [{"id": 2, "code": "academic_transcript", "label": "Academic Transcript"}],
  "dataTypes": [{"value": "number", "label": "Number"}],
  "operators": [{"value": "greater_than_or_equal", "label": "Greater than or equal to"}],
  "operatorsByDataType": {"text": ["equal_to", "not_equal_to", "contains", "one_of"], "number": ["..."], "boolean": ["equal_to"], "date": ["..."]}
}
```

- **Categories:** Academic Qualification, English Proficiency, Work Experience, Financial, Age, Nationality / Residency, Other.
- **Document types:** Passport, Academic Transcript, Degree Certificate, English Language Certificate, CV / Resume, Statement of Purpose, Recommendation Letter, Work Experience Letter, Financial Document, Application Form, Other.
- **Data types:** `text`, `number`, `boolean` (Yes / No), `date`.
- **Operators:** `equal_to`, `not_equal_to`, `greater_than`, `greater_than_or_equal`, `less_than`, `less_than_or_equal`, `between`, `one_of`, `contains`.
- In the Operator dropdown, show only `operatorsByDataType[dataType]`, and clear the operator when the data type changes.

Categories and document types are shared by all tenants and kept in the database. Load them from this endpoint instead of hard-coding them.

#### Criterion fields

| Field | Type | Required on create | Notes |
|---|---|---|---|
| `name` | string, max 150 | yes | Criterion Name |
| `categoryId` | integer | yes | From `options.categories` |
| `description` | string, max 5000 | no | |
| `dataType` | enum | yes | `text`, `number`, `boolean`, `date` |
| `operator` | enum | yes | Must be allowed for the data type (`operatorsByDataType`) |
| `unit` | string, max 50 | no | e.g. `"GPA"`, `"IELTS band"` |
| `requiredValue` | string, max 255 | yes | Format depends on the data type, see below |
| `evidenceInstructions` | string, max 5000 | no | |
| `rejectionReason` | string, max 255 | no | |
| `documentTypeIds` | integer array | no | "Which document should the AI check": ids from `options.documentTypes`. On `PATCH` the list replaces the old one |
| `isMandatory` | boolean | no | Default `true` |
| `effectiveDate` | string `YYYY-MM-DD` | no | |
| `expiryDate` | string `YYYY-MM-DD` | no | Not before `effectiveDate` |

`requiredValue` format:

| Data type | One value | `between` | `one_of` |
|---|---|---|---|
| `number` | `3.0` | `6.0,9.0` (min first) | `6.5,7,7.5` |
| `date` | `2026-12-31` | `2026-01-01,2026-12-31` | not allowed |
| `boolean` | `true` or `false` | not allowed | not allowed |
| `text` | any text | not allowed | `UK,Ireland` |

A criterion, as returned by the API:

```json
{
  "id": 7,
  "versionId": 3,
  "name": "Minimum GPA",
  "categoryId": 1,
  "category": "Academic Qualification",
  "description": "Minimum GPA of 3.0 out of 4.0",
  "dataType": "number",
  "operator": "greater_than_or_equal",
  "unit": "GPA",
  "requiredValue": "3.0",
  "evidenceInstructions": "Check GPA on transcript",
  "rejectionReason": "GPA below 3.0",
  "isMandatory": true,
  "effectiveDate": "2026-01-01",
  "expiryDate": null,
  "sortOrder": 1,
  "documentTypeIds": [2],
  "documentTypes": [{"id": 2, "label": "Academic Transcript"}]
}
```

Criteria come sorted by `sortOrder`; new ones are added at the end. For the up / down arrows, send the full new order to `PUT /versions/:id/criteria/order`.

#### Document requirement fields

| Field | Type | Required on create | Notes |
|---|---|---|---|
| `documentTypeId` | integer | yes | From `options.documentTypes`. Each document type once per version |
| `customLabel` | string, max 150 | no | e.g. `"Bachelor's Transcript"` |
| `instructions` | string, max 500 | no | e.g. `"Must be official"` |
| `isRequired` | boolean | no | Default `true`. `false` shows as Optional |

Returned as `{id, versionId, documentTypeId, documentType, customLabel, instructions, isRequired, sortOrder}`, where `documentType` is the label.

#### A set and a version, as returned by the API

`GET /v1/eligibility/sets/:id`:

```json
{
  "id": 3,
  "tenantId": 1,
  "name": "UK Masters Standard",
  "description": "Common rules",
  "publishedVersion": 2,
  "draftVersion": 3,
  "programCount": 2,
  "createdAt": "2026-10-23T07:00:00.000Z",
  "updatedAt": "2026-10-23T07:00:00.000Z",
  "versions": [{"id": 12, "versionNumber": 3, "status": "draft", "publishedAt": null, "criteriaCount": 4}],
  "programs": [{"id": 5, "name": "MSc Data Science", "code": "MSDS"}]
}
```

`GET /v1/eligibility/sets` returns the same objects without `versions` and `programs`. `publishedVersion` and `draftVersion` are `null` when there is none. A version label such as "v3 — draft" comes from `versionNumber` and `status`.

`GET /v1/eligibility/versions/:id`:

```json
{
  "id": 12,
  "eligibilitySetId": 3,
  "versionNumber": 3,
  "status": "draft",
  "publishedAt": null,
  "createdAt": "2026-10-23T07:00:00.000Z",
  "updatedAt": "2026-10-23T07:00:00.000Z",
  "criteria": [ /* criteria */ ],
  "documentRequirements": [ /* document requirements */ ]
}
```

#### Eligibility errors

| Status | When | Body |
|---|---|---|
| `422` | A field is invalid or missing, or an id is not a number | `errors` = `{ field: message }` |
| `422` | Operator not allowed for the data type | `errors` = `{ "operator": "Contains cannot be used with Number" }` |
| `422` | `requiredValue` in the wrong format | e.g. `{ "requiredValue": "Enter two values: min,max" }` |
| `422` | Expiry before effective date | `{ "expiryDate": "Expiry date must be on or after the effective date" }` |
| `422` | Unknown category, document type or program | `{ "categoryId": "Category not found" }`, `{ "programIds": "Programs not found: 9" }` |
| `409` | Changing a published or archived version | `message`: `"Only a draft version can be changed; create a new version first"` |
| `409` | New Version while a draft exists | `message`: `"Version 3 is already a draft; edit or publish it first"` |
| `409` | Publishing a draft without criteria | `message`: `"Add at least one criterion before publishing"` |
| `409` | Set name already used in your tenant | `message`: `"An eligibility set with this name already exists"` |
| `409` | Same document type twice in a version | `message`: `"This document type is already in the list"` |
| `409` | Deleting a set that programs use | `message`: `"Eligibility set is assigned to programs; unassign them first"` |
| `404` | Set, version, criterion or document not found in your tenant | e.g. `message`: `"Eligibility version not found"` |

### Dashboard

Everything on the **Dashboard** page in one call: `GET /v1/dashboard`. Needs Applications read (every role by default).

| Param | Notes |
|---|---|
| `from`, `to` | Optional period, `YYYY-MM-DD`, both days included, at most 366 days. Without them the counts cover all time and the trend the last 30 days |
| `programId` | Optional: only this program |
| `utcOffset` | The viewer's offset from UTC in minutes, so "today" and the trend days are their days: `-new Date().getTimezoneOffset()` (India: `330`). Default `0` |

```js
const dashboard = await api(`/dashboard?utcOffset=${-new Date().getTimezoneOffset()}`);
```

Response `data`:

```json
{
  "period": {"from": null, "to": null, "utcOffset": 330},
  "stats": {
    "totalApplications": 15, "drafts": 2, "receivedToday": 1, "pendingAssessments": 4,
    "conditionalOffers": 2, "rejections": 2, "manualReview": 7, "missingDocuments": 1, "unassigned": 6,
    "lettersWaiting": 2, "emailsSent": 14, "failedEmails": 1, "avgProcessingSeconds": 81
  },
  "rates": {"assessed": 11, "offer": 0.1818, "rejection": 0.1818, "manualReview": 0.6364},
  "statuses": [{"value": "submitted", "label": "Submitted", "count": 4}],
  "outcomes": [{"value": "conditional_offer", "label": "Conditional Offer", "count": 2}],
  "programs": [{"id": 3, "name": "MSc Data Science", "code": "MSDS", "count": 8}],
  "trend": [{"date": "2026-10-24", "count": 1}],
  "recentApplications": [
    {"id": 12, "applicationNumber": "APP-49975668", "studentName": "Aisha Mohammed", "programName": "MSc Data Science",
     "status": "submitted", "assessmentStatus": "pending", "outcome": null, "submittedAt": "2026-10-24T13:52:56.000Z"}
  ],
  "attention": {
    "total": 9,
    "items": [
      {"id": 7, "applicationNumber": "APP-99690072", "studentName": "Aarav Mehta", "programName": "MBA Business Administration",
       "since": "2026-09-13T12:28:08.000Z", "reasons": [{"code": "manualReview", "label": "Manual review needed"}]}
    ]
  },
  "activity": [
    {"type": "submitted", "label": "Application submitted", "applicationId": 12, "applicationNumber": "APP-49975668",
     "userName": "Riya", "at": "2026-10-24T13:52:56.000Z"}
  ]
}
```

| Card / chart | Field |
|---|---|
| Total Applications | `stats.totalApplications`: submitted in the period (drafts are separate in `stats.drafts`) |
| Received Today | `stats.receivedToday`: submitted today, whatever the period |
| Pending Assessments | `stats.pendingAssessments`: assessment `pending` or `in_progress` |
| Conditional Offers / Rejections / Manual Review | `stats.conditionalOffers`, `stats.rejections`, `stats.manualReview`: by outcome |
| Missing Documents | `stats.missingDocuments`: submitted applications without a file for a required document |
| Unassigned (new) | `stats.unassigned`: submitted applications without an officer |
| Avg Processing Time | `stats.avgProcessingSeconds`: how long a completed AI assessment run takes on average, in seconds, for the applications in the period (81 → "1m 21s"). `null` when nothing was assessed yet: show "—" |
| Letters Waiting | `stats.lettersWaiting`: applications whose letter waits for approval |
| Emails Sent, Failed Emails | `stats.emailsSent` / `stats.failedEmails`: emails to the students of these applications |
| Offer / Rejection / Manual Review Rate | `rates.offer` etc.: share of the **assessed** applications (`rates.assessed`), `0` to `1` (`0.1818` → **18%**). `null` when nothing is assessed yet |
| Application Outcomes (donut) | `outcomes`: always the three outcomes, with counts |
| Applications by Program (bars) | `programs`: up to 10, most applications first |
| Applications over time (new, line chart) | `trend`: one entry per day of the range, `0` on days without submissions |
| Status breakdown (new) | `statuses`: every status with its count |
| Recent Applications | `recentApplications`: the 5 latest submitted. **View All** → the Applications list |
| Items Requiring Attention | `attention.items`: up to 10, **oldest waiting first**, each with its `reasons` (`manualReview`, `assessmentFailed`, `missingDocuments`). `attention.total` is the full count, e.g. for "View Queue (9)" |
| Recent Activity | `activity`: the 10 latest events (`created`, `submitted`, `document_uploaded`) with `label`, who (`userName`, `null` when unknown) and when (`at`) |

The period and program filters apply to all counts and charts except **Received Today**; **Recent Applications**, **Items Requiring Attention** and **Recent Activity** follow only the program filter. Errors: `422` for a bad date or offset, `{ "from": "From must be on or before to" }`, or `{ "to": "Pick a period of at most 366 days" }`.

### Applications

A student's application to a program for an intake: the **New Application** wizard and the **Applications** list. Needs the Applications permission. By default Super Admin, Institution Admin and Admissions Officer can do everything; Reviewer and Read Only can only read.

How the wizard maps to the API:

1. **Student Information** and **Program Information**: keep both steps in the form, then on **Next** of step 2 create a **draft** with `POST /v1/applications`. Going back and changing something is `PATCH /v1/applications/:id`.
2. **Documents**: `GET /v1/applications/:id` lists the documents the program asks for (`documentRequirements`). Each **Upload** is `POST /v1/applications/:id/documents`.
3. **Review & Submit**: show the same `GET`. The checkbox is sent as `{confirmed: true}` to `POST /v1/applications/:id/submit`.

A **draft** can be edited, get documents or be deleted. After **submit** it is locked: those calls answer `409` `"A submitted application cannot be changed"`. One exception: while the application is in **manual review**, documents can still be uploaded (the reviewer adds what they [asked the student for](frontend-guide-03.md#request-documents-post-v1reviewsidrequest-documents)).

| Method | Path | What it does | Permission |
|---|---|---|---|
| `GET` | `/v1/applications/options` | Dropdown values (below) | read |
| `GET` | `/v1/applications` | The list, paginated, with filters | read |
| `POST` | `/v1/applications` | Create a draft (wizard steps 1 and 2) | create |
| `GET` | `/v1/applications/:id` | One application with its documents | read |
| `PATCH` | `/v1/applications/:id` | Change a draft | update |
| `DELETE` | `/v1/applications/:id` | Delete a draft | delete |
| `POST` | `/v1/applications/:id/documents` | Upload one file to a draft, or to an application in manual review | create |
| `DELETE` | `/v1/applications/documents/:id` | Remove a file from a draft | delete |
| `GET` | `/v1/applications/documents/:id/download-url` | A short-lived link to download a file | read |
| `POST` | `/v1/applications/:id/submit` | Submit: `{"confirmed": true}` | create |
| `PUT` | `/v1/applications/:id/officer` | Set the officer: `{"officerId": 5}`, `null` to unassign. Any status | update |
| `PUT` | `/v1/applications/:id/outcome` | **Change outcome**, see [Decisions](frontend-guide-03.md#change-outcome-put-v1applicationsidoutcome) | update |
| `GET` | `/v1/applications/:id/activity` | The **Activity** tab, see [Activity](frontend-guide-03.md#activity-tab) | read |
| `GET` / `POST` | `/v1/applications/:id/notes` | The notes / add a note, see [Notes](frontend-guide-03.md#notes) | read / create |
| `POST` | `/v1/applications/documents/:id/extract` | The AI reads one document now, see [Extract one document](frontend-guide-03.md#extract-one-document) | create |
| `GET` | `/v1/applications/documents/:id/extraction` | The newest AI reading of a document | read |
| `POST` / `GET` | `/v1/applications/:id/assess`, `/:id/assessment`, `/:id/assessments`, `/v1/applications/assessments/:id` | Run Assessment (`202`) and its results, see [AI Assessment](frontend-guide-03.md#ai-assessment-run-assessment) | create / read |
| `GET` / `POST` | `/v1/applications/:id/letters` | The letters / Generate Letter, see [Letters](frontend-guide-03.md#letters); also need Letters read / create | read / create |
| `GET` | `/v1/applications/:id/emails` | The **Comms** tab, see [Communications](frontend-guide-03.md#communications-emails-to-students); also needs Communications read | read |

#### `GET /v1/applications/options`

```json
{
  "intakes": [{"term": "fall", "year": 2026, "label": "Fall 2026"}],
  "genders": [{"value": "female", "label": "Female"}],
  "studyModes": [{"value": "full_time", "label": "Full Time"}],
  "statuses": [{"value": "submitted", "label": "Submitted"}],
  "assessmentStatuses": [{"value": "in_progress", "label": "In Progress"}],
  "outcomes": [{"value": "conditional_offer", "label": "Conditional Offer"}],
  "officers": [{"id": 5, "name": "Riya", "email": "riya@yopmail.com", "roleName": "Admissions Officer"}],
  "upload": {"maxSizeMb": 10, "extensions": [".pdf", ".docx", ".jpg", ".jpeg", ".png"]}
}
```

- **Intake** dropdown: `intakes` (this year and the next two, four terms each). Send its `term` and `year`.
- **Program** dropdown: `GET /v1/programs?status=active` (only active programs can get applications). `program.studyMode` is the default for **Study Mode**.
- **Nationality** and **Country of Residence**: `GET /v1/locations/countries`; send the country `id`.
- The **"Criteria Version Locked"** box in step 2 comes from the program: `program.eligibilitySet.publishedVersion` (e.g. `1`). If it is `null`, the program has no published criteria and the application cannot be submitted, so warn there.

#### Create: `POST /v1/applications`

```js
const application = await api("/applications", {
  method: "POST",
  body: {
    student: {
      firstName: "Aisha", middleName: "", lastName: "Mohammed",
      dateOfBirth: "2000-05-01", gender: "female", nationalityId: 161, residenceCountryId: 161,
      passportNumber: "NG1234567", email: "aisha@yopmail.com", phone: "+234 801 234 5678", address: "Lagos",
    },
    programId: 3, intakeTerm: "fall", intakeYear: 2026, studyMode: "full_time", applicationDate: "2026-10-24",
  },
});
```

| Field | Required | Notes |
|---|---|---|
| `student.firstName`, `student.lastName` | yes | max 100 |
| `student.email` | yes | Stored in lowercase |
| `student.middleName`, `passportNumber`, `address` | no | |
| `student.dateOfBirth` | no | `YYYY-MM-DD`, not in the future |
| `student.gender` | no | `male`, `female`, `other`, `prefer_not_to_say` |
| `student.nationalityId`, `student.residenceCountryId` | no | Country ids |
| `student.phone` | no | with the country code (`+` or `00`); spaces, `- ( ) .` allowed; saved as E.164 `+2348012345678` |
| `programId` | yes | An active program |
| `intakeTerm`, `intakeYear` | yes | From `options.intakes` |
| `studyMode` | no | Default: the program's study mode |
| `applicationDate` | no | Default: today |

- **One student per email** in your institution. Creating an application with an email that already exists uses that student and updates their details with the ones sent, so a student who applies to two programs is stored once.
- A student cannot apply twice to the same program and intake: `409` `"This student already has an application for this program and intake"`.
- `PATCH` takes the same fields, all optional; `student` may hold only the fields that change. Changing the email to another student's answers `409` `"Another student already uses this email"`.

#### An application, as returned by the API

```json
{
  "id": 12,
  "applicationNumber": "APP-49975668",
  "status": "draft",
  "assessmentStatus": null,
  "outcome": null,
  "confidence": null,
  "decision": null,
  "letter": null,
  "student": {
    "id": 4, "firstName": "Aisha", "middleName": null, "lastName": "Mohammed", "fullName": "Aisha Mohammed",
    "dateOfBirth": "2000-05-01", "gender": "female",
    "nationality": {"id": 161, "name": "Nigeria"}, "residenceCountry": {"id": 161, "name": "Nigeria"},
    "passportNumber": "NG1234567", "email": "aisha@yopmail.com", "phone": "+2348012345678", "address": "Lagos"
  },
  "program": {"id": 3, "name": "BSc Computer Science", "code": "BCSC"},
  "intakeTerm": "fall", "intakeYear": 2026, "intake": "Fall 2026",
  "studyMode": "full_time", "applicationDate": "2026-10-24", "documentCount": 1,
  "eligibilityVersion": {"id": 7, "versionNumber": 1, "locked": false},
  "officer": null, "submittedAt": null, "submittedBy": null,
  "createdAt": "2026-10-24T10:00:00.000Z", "updatedAt": "2026-10-24T10:00:00.000Z",
  "documentRequirements": [
    {
      "documentTypeId": 1, "documentType": "Passport", "customLabel": null, "instructions": null, "isRequired": true,
      "documents": [
        {"id": 31, "documentTypeId": 1, "documentType": "Passport", "originalName": "passport.pdf",
         "mimeType": "application/pdf", "sizeBytes": 182044, "uploadedBy": {"id": 5, "name": "Riya"},
         "createdAt": "2026-10-24T10:02:00.000Z"}
      ]
    }
  ],
  "otherDocuments": [],
  "missingDocuments": ["Academic Transcript"]
}
```

- `applicationNumber`: `APP-` and 8 random digits, unique in your institution. Show it as the **App #**.
- `eligibilityVersion`: the criteria version that applies. While a draft, it is the program's current published version (`locked: false`, it follows new versions). Submitting locks it (`locked: true`), so later rule changes don't affect the application. `null` = the program has no published criteria.
- `documentRequirements`: the documents that version asks for, in order, each with the files uploaded for it. Show **Required** when `isRequired`, and the label as `customLabel || documentType`.
- `otherDocuments`: files whose type the version does not ask for. `missingDocuments`: the labels of required documents without a file.
- `GET /v1/applications` returns the same objects **without** `documentRequirements`, `otherDocuments` and `missingDocuments`; there a draft's `eligibilityVersion` is `null` (only `GET /v1/applications/:id` shows the version it would get).

#### Status, assessment and outcome

| Field | Values (labels in `options`) |
|---|---|
| `status` | `draft` → `submitted` → `processing` → `manual_review` / `completed` |
| `assessmentStatus` | `null` while a draft; `pending` after submit; then `in_progress`, `completed` or `failed` |
| `outcome` | `null` until assessed; then `conditional_offer`, `rejection` or `manual_review` |
| `confidence` | `null`, or `0` to `1` (show `0.94` as **94%**) |
| `letter` | The current letter: `null`, or `{id, referenceNumber, letterType, status, emailStatus}`, see [Letters](frontend-guide-03.md#letters) |
| `decision` | Who decided the outcome: `null`, or `{source: "ai" \| "manual", by, at, reason}`, see [Decisions](frontend-guide-03.md#decisions) |

On submit the application becomes `submitted` + `pending`. The [AI assessment](frontend-guide-03.md#ai-assessment-run-assessment) then moves it to `processing` / `in_progress`, and to `completed` or `manual_review` with `outcome` and `confidence` (or back to `submitted` / `failed`). Run it with `POST /v1/applications/:id/assess`.

#### Documents

Upload one file per request as `multipart/form-data` with two fields, `documentTypeId` and `file`. Don't set the `Content-Type` header yourself; the browser adds it with the boundary.

```js
const form = new FormData();
form.append("documentTypeId", requirement.documentTypeId);
form.append("file", fileInput.files[0]);

const res = await fetch(`${API_BASE_URL}/applications/${id}/documents`, {
  method: "POST",
  headers: {Authorization: `Bearer ${localStorage.getItem("token")}`},
  body: form,
});
```

- Accepted: **PDF, DOCX, JPG, PNG**, at most **10 MB**. The file's content must match its extension: a renamed file is refused. Errors come on the `file` field, e.g. `{ "file": "The file must be at most 10 MB" }`. A damaged DOCX, or one that would unpack to far more than its size (over 60 MB): `{ "file": "This DOCX file is damaged, or too large once unpacked" }`.
- `documentTypeId` is any id from `GET /v1/eligibility/options` → `documentTypes`, so files outside the requirements can be added too (they show in `otherDocuments`).
- Several files per document type are allowed. The response `data` is the new document (as in `documents` above).
- **Download**: `GET /v1/applications/documents/:id/download-url` answers `{url, expiresIn}`. The link works for `expiresIn` seconds (5 minutes) without the token, and downloads the file under its original name: `window.open(url)` or `<a href={url}>`. Get a fresh link each time instead of storing it.
- Files are stored in S3. If the backend has no S3 configured, upload and download answer `503` `"File storage is not configured"`.

#### Submit: `POST /v1/applications/:id/submit`

Body `{"confirmed": true}`, the checkbox **"I confirm that the information provided is accurate and the student has consented to processing"**. The response `data` is the submitted application.

- Missing documents do not block submitting; they stay in `missingDocuments`.
- The program must still be active and have published eligibility criteria.

#### `GET /v1/applications`

| Param | Notes |
|---|---|
| `page`, `limit` | Default `1` and `20`, `limit` max `100` |
| `search` | Part of the application number, the student's name or email |
| `programId` | **All Programs** filter |
| `status` | **All Statuses** filter |
| `outcome` | **All Outcomes** filter |
| `letterStatus` | `pending_approval`, `approved`, `rejected`, or `none` (no current letter) |
| `assessmentStatus`, `officerId`, `intakeTerm`, `intakeYear` | **More Filters** |
| `submittedFrom`, `submittedTo` | `YYYY-MM-DD`, both days included |

Newest first (submitted ones by submission time, drafts by creation). Response `data`: `{items, total, page, limit}`. Table columns: **App #** `applicationNumber`, **Student** `student.fullName`, **Program** `program.name`, **Submitted** `submittedAt` (empty for a draft), **Status**, **Assessment** `assessmentStatus`, **Outcome**, **Confidence**, **Officer** `officer.name`.

#### Application errors

| Status | When | Body |
|---|---|---|
| `422` | A field is invalid or missing (student fields come as `student.firstName` etc.) | `errors` = `{ field: message }` |
| `422` | Program not active or not yours | `{ "programId": "Pick an active program" }` |
| `422` | Unknown country | `{ "student.nationalityId": "Country not found" }` |
| `422` | Upload: unknown document type | `{ "documentTypeId": "Document type not found" }` |
| `422` | Upload: not a PDF, DOCX, JPG or PNG, or a renamed file | `{ "file": "Upload a PDF, DOCX, JPG or PNG file" }` |
| `422` | Submit without the checkbox | `{ "confirmed": "Confirm that the information is accurate and the student has consented" }` |
| `422` | Officer cannot log in or is not yours | `{ "officerId": "Pick a user of your institution who can log in" }` |
| `409` | Same student, program and intake | `message`: `"This student already has an application for this program and intake"` |
| `409` | Changing, deleting or submitting a submitted application | `message`: `"A submitted application cannot be changed"` |
| `409` | Uploading to an application that is neither a draft nor in manual review | `message`: `"Documents can only be added to a draft or an application in manual review"` |
| `502` | S3 refused the file (e.g. a storage setup problem) | `message`: `"The file could not be stored, please try again"` |
| `409` | Submit when the program has no published criteria, or is no longer active | `message`: `"The program has no published eligibility criteria; publish them first"` / `"The program is no longer active"` |
| `404` | No application or document with that id in your institution | `message`: `"Application not found"` / `"Document not found"` |
| `503` | S3 not configured | `message`: `"File storage is not configured"` |
