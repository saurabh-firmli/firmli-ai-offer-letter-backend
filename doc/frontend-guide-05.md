# Frontend Guide: Firmli AI Offer Letter API (part 05)

Parts: [01 — basics, login, users, roles, programs, campuses, locations](frontend-guide-01.md) · [02 — letter templates, email templates, eligibility, dashboard, applications](frontend-guide-02.md) · [03 — manual review queue, decisions, AI assessment, letters, communications, notes, extract, notifications, activity](frontend-guide-03.md) · [04 — live updates, branding, dropdowns](frontend-guide-04.md) · [05 — settings, reports, AI usage, audit logs, Firmli staff (switch user, platform panel)](frontend-guide-05.md). This is part 05.

Base URL, the token, the response format, errors, status codes and the `api()` helper used below are in [part 01](frontend-guide-01.md).

## Endpoints (continued)

### Settings

The organization's settings: the **Settings** page. One record per tenant, created with the tenant. Needs the Settings permission: by default the Super Admin can read and save, the Institution Admin can only read, and other roles can't open the page (hide it with `can(user, "settings", "read")`, and the Save button with `can(user, "settings", "update")`).

| Method | Path | What it does |
|---|---|---|
| `GET` | `/v1/settings` | The settings |
| `GET` | `/v1/settings/options` | AI models and the users who can be the default reviewer, for the dropdowns |
| `PATCH` | `/v1/settings` | Save. Send the whole form or only what changed |
| `POST` | `/v1/settings/test-email` | **Send test email**: `{to}` (optional, default: you). Needs Settings update |
| `PUT` / `DELETE` | `/v1/settings/logo` | **Logo** upload / remove, and the `brandColor` field: see [part 04](frontend-guide-04.md#branding-logo-and-colour) |

#### Fields

| Section | Field | Type | Default | Notes |
|---|---|---|---|---|
| Institution Details | `name` | string, max 150 | | Institution Name. Also the tenant name in `user.tenant.name` |
| | `code` | string | | Institution Code. **Read only**: set by the Firmli team, ignored on save. Can be `null` |
| | `contactEmail` | email | `null` | |
| | `phone` | string with the country code, saved as E.164 `+919876543210` | `null` | |
| | `address` | string, max 500 | `null` | |
| | `website` | URL starting with `http://` or `https://`, max 255 | `null` | Institution website. Also `{{institution_website}}` in letter and email templates |
| Automation | `autoAssessment` | boolean | `true` | Automatic assessment |
| | `autoLetterGeneration` | boolean | `true` | Generate the letter once an application is decided ([Letters](frontend-guide-03.md#letters)) |
| | `autoEmailDispatch` | boolean | `false` | Email the letter once it is approved ([Communications](frontend-guide-03.md#communications-emails-to-students)) |
| Decision Safety | `autoApproveOffers` | boolean | `false` | Auto-approve conditional offers |
| | `autoApproveRejections` | boolean | `false` | Auto-approve rejections. Needs `requireRejectionApproval` off |
| | `requireRejectionApproval` | boolean | `true` | Always require approval for rejections |
| | `requireManualReviewEdgeCases` | boolean | `true` | Require manual review for edge cases |
| | `flagLowConfidence` | boolean | `true` | Flag low-confidence assessments |
| | `flagMissingDocuments` | boolean | `true` | Flag missing documents |
| | `offerConfidenceThreshold` | number 0 to 1 | `0.85` | Rounded to 2 decimals |
| | `rejectionConfidenceThreshold` | number 0 to 1 | `0.9` | Rounded to 2 decimals |
| Default Reviewer | `defaultReviewerId` | integer | `null` | From `options.reviewers`; `null` = none |
| Email Configuration | `emailMaxRetries` | integer 0 to 10 | `3` | Max Retry Attempts: automatic retries of a failed email |
| | `smtpEnabled` | boolean | `false` | **Use our own email server.** Off = emails go through Firmli's server in your institution's name |
| | `smtpHost`, `smtpPort` | string, integer | `null` | e.g. `smtp.sendgrid.net`, `587`. Required when `smtpEnabled` |
| | `smtpSecure` | boolean | `false` | `true` for port 465 |
| | `smtpUser` | string | `null` | Login name, if the server needs one |
| | `smtpPassword` | string | | **Write only**, like `openaiApiKey`: send to set or replace, `""` to remove. Required with a `smtpUser` |
| | `smtpFromEmail`, `smtpFromName` | email, string | `null` | The sender students see. `smtpFromEmail` is required when `smtpEnabled`; the name defaults to the institution name |
| AI Configuration | `extractionModelId` | integer | GPT-5.6 Luna | Extraction Model (primary), from `options.aiModels`. Cannot be cleared |
| | `extractionFallbackModelId` | integer | GPT-5.6 Terra | Extraction Fallback Model |
| | `assessmentModelId` | integer | GPT-5.6 Terra | Assessment Model (primary) |
| | `assessmentEscalationModelId` | integer | GPT-5.6 Sol | Assessment Escalation Model |
| | `verifyDocumentType` | boolean | `true` | Verify document type |
| | `openaiApiKey` | string `sk-...` | `null` | **Your institution's own OpenAI key.** Write only: send it to set or replace, `""` or `null` to remove; leave it out to keep it. Never sent back in full |
| | `extractionPrompt` | string, max 20,000 | `null` | Custom Extraction Prompt. `null` or `""` = the built-in prompt. May use `{category}` |
| | `assessmentPrompt` | string, max 20,000 | `null` | Custom Assessment Prompt. `null` or `""` = the built-in prompt |

Read only, in the response only:

- `aiConfigured`: `true` when your institution has saved an OpenAI key. Show the **AI Active** badge only then.
- `openaiApiKey` in the response is only masked, e.g. `"sk-...abcd"` (or `null`). Show it as a placeholder and send a new key only when the user types one.
- `defaultReviewer`: `{id, name}` of the default reviewer, or `null`. A reviewer who was deleted later counts as none.
- `smtpPasswordSet`: `true` when an SMTP password is saved (it is never sent back).
- `emailSender`: who students see emails from: `{"type": "custom", "from": "Apex Admissions <admissions@apex.com>"}` with your own server, or `{"type": "default", "from": "Apex Study Abroad <no-reply@firmli.com>"}` (`from` is `null` if Firmli's server is not set up either).
- `logo`: `{url, expiresIn}`, a short-lived link to the logo, or `null` (see [Branding](frontend-guide-04.md#branding-logo-and-colour)).
- `updatedAt`: when the settings were last saved.

```json
{
  "name": "Firmli University", "code": "FIRMLI", "contactEmail": null, "phone": null, "address": null, "website": null,
  "autoAssessment": true, "autoLetterGeneration": true, "autoEmailDispatch": false,
  "autoApproveOffers": false, "autoApproveRejections": false, "requireRejectionApproval": true,
  "requireManualReviewEdgeCases": true, "flagLowConfidence": true, "flagMissingDocuments": true,
  "offerConfidenceThreshold": 0.85, "rejectionConfidenceThreshold": 0.9,
  "defaultReviewerId": null, "defaultReviewer": null, "emailMaxRetries": 3,
  "extractionModelId": 1, "extractionFallbackModelId": 2, "assessmentModelId": 2, "assessmentEscalationModelId": 3,
  "verifyDocumentType": true, "extractionPrompt": null, "assessmentPrompt": null,
  "brandColor": "#1E3A8A", "logo": null,
  "smtpEnabled": false, "smtpHost": null, "smtpPort": null, "smtpSecure": false, "smtpUser": null, "smtpPasswordSet": false,
  "smtpFromEmail": null, "smtpFromName": null, "emailSender": {"type": "default", "from": "Firmli University <no-reply@firmli.com>"},
  "openaiApiKey": "sk-...abcd", "aiConfigured": true, "updatedAt": "2026-10-23T10:00:00.000Z"
}
```

#### `GET /v1/settings/options`

```json
{
  "aiModels": [{"id": 1, "code": "gpt-5.6-luna", "name": "GPT-5.6 Luna", "description": "Fast, cost-effective", "provider": {"code": "openai", "name": "OpenAI (ChatGPT)"}, "available": true, "inputPricePer1m": 0.2, "cachedInputPricePer1m": 0.02, "outputPricePer1m": 1.2}],
  "reviewers": [{"id": 5, "name": "Riya", "email": "riya@yopmail.com", "roleName": "Reviewer"}]
}
```

- Model dropdown label: `` `${model.name} (${model.description})` ``. Each model also has its prices in USD per 1M tokens (`inputPricePer1m`, `cachedInputPricePer1m`, `outputPricePer1m`, `null` = not set), see [AI Usage](#ai-usage). The list comes from the database, so load it instead of hard-coding it.
- Models come sorted by provider (OpenAI (ChatGPT), then Anthropic (Claude)); group the dropdown by `provider.name`. `available: false` = the app cannot call that provider yet (Claude for now): show it disabled, e.g. "Coming soon". Saving one answers `422`.
- `reviewers` are the users of your institution who can log in (status `active`, or `inactive` for those who have not logged in yet).

#### Saving

```js
const settings = await api("/settings", {method: "PATCH", body: form});
```

- The response `data` is the saved settings. Fields not sent stay as they are, and `code` is ignored.
- Every save that changes something is one [audit log](#audit-logs) entry (`module` `settings`, `entityType` `settings`) with `{field: {from, to}}`. The OpenAI key shows there only as `"***"`.
- After changing `name`, call `GET /v1/auth/me` again so the header shows the new name.
- **Own email server:** fill the SMTP fields, switch `smtpEnabled` on, save, then **Send test email**. It answers `{sentTo, sender}` (`sender`: `custom` or `default`). If the server refuses, the `502` message gives its reason, e.g. `"The email could not be sent: Invalid login: 535 Authentication failed"`, so show it as it is. Switching off keeps the details for later.
- **Auto-approve rejections** only works with **Always require approval for rejections** off. Turn the second switch off when the first is turned on, or send both in one save.

| Status | When | Body |
|---|---|---|
| `422` | A field is invalid, e.g. a threshold above 1, retries above 10, an empty name | `errors` = `{ field: message }` |
| `422` | No field to save (only `code`, or an empty body) | `errors` = `{ field: message }` |
| `422` | Bad phone, or no country code | `{ "phone": "Enter the number with its country code, e.g. +919876543210" }` |
| `422` | Unknown AI model, or one with `available: false` | `{ "extractionModelId": "AI model not found, or its provider is not available yet" }` |
| `422` | Reviewer who cannot log in (banned, blocked, ...), deleted, or from another institution | `{ "defaultReviewerId": "Pick a user of your institution who can log in" }` |
| `422` | Auto-approve rejections while approval is required | `{ "autoApproveRejections": "Turn off \"Always require approval for rejections\" to auto-approve rejections" }` |
| `422` | Not an OpenAI key | `{ "openaiApiKey": "Enter a valid OpenAI API key (it starts with sk-)" }` |
| `503` | Saving a key while the backend has no `ENCRYPTION_KEY` | `message`: `"Encryption is not configured"` |
| `422` | Own email server switched on without its details | `{ "smtpHost": "Enter the SMTP server", "smtpPort": "...", "smtpFromEmail": "..." }`, `{ "smtpPassword": "Enter the SMTP password" }` |
| `422` | SMTP server (outside development, checked by the address its name points to): an internal one, or a name that does not exist | `{ "smtpHost": "Use your mail provider's public SMTP server" }`, `{ "smtpHost": "We could not find this server; check its name" }` |
| `422` | Not a server name / not a web address | `{ "smtpHost": "Enter a server name such as smtp.example.com" }`, `{ "website": "Enter the full web address, e.g. https://www.example.com" }` |
| `403` | No Settings permission | `errors[0].message`: `"You do not have permission to update settings"` |

### Reports

The **Reports** page: KPIs, charts and a CSV download of the applications **submitted** in a period. Needs Applications read (like the dashboard).

| Method | Path | What it does |
|---|---|---|
| `GET` | `/v1/reports` | KPIs and charts |
| `GET` | `/v1/reports/export` | The applications as a CSV file |

Both take the dashboard's filters: `from`, `to` (`YYYY-MM-DD`, both included; none = all time), `utcOffset` (`-new Date().getTimezoneOffset()`) and `programId`. A period is at most 366 days (`GET /v1/reports`; the export takes any period, and a `from` after `to` gives an empty file).

#### `GET /v1/reports`

```json
{
  "period": {"from": null, "to": null, "utcOffset": 330},
  "kpis": {
    "totalApplications": 40, "conditionalOffers": 18, "rejections": 9, "manualReviews": 5, "inProgress": 8,
    "assessmentCompletionRate": 0.8, "avgConfidence": 0.87, "documentCompletionRate": 0.9,
    "avgProcessingSeconds": 42, "manualDecisions": 4, "emailsSent": 31
  },
  "charts": {
    "overTime": [{"date": "2026-10-25", "submitted": 3, "conditionalOffers": 1, "rejections": 1, "manualReviews": 0}],
    "outcomes": [{"value": "conditional_offer", "label": "Conditional Offer", "count": 18}],
    "programs": [{"id": 50, "code": "MSCDS", "name": "MSc Data Science", "total": 20, "conditionalOffers": 9, "rejections": 4, "manualReviews": 2, "assessed": 15, "offerRate": 0.6}],
    "assessments": [{"date": "2026-10-25", "completed": 4, "failed": 0, "avgSeconds": 38}]
  }
}
```

| Card / chart | Field |
|---|---|
| Total Applications | `kpis.totalApplications` |
| Offers / Rejections / In Manual Review | `conditionalOffers`, `rejections`, `manualReviews` (outcome now) |
| Processing | `inProgress`: submitted or being assessed |
| Assessment Completion | `assessmentCompletionRate`: share with an outcome, `0` to `1` (`0.8` → **80%**) |
| Avg Confidence | `avgConfidence`, `0` to `1` |
| Document Completion | `documentCompletionRate`: share with every required document |
| Avg Processing Time | `avgProcessingSeconds` of an AI run (42 → "42s") |
| Decided by People | `manualDecisions`: outcomes set by a Manual Review decision or Change outcome |
| Emails Sent | `emailsSent`: emails to these applications' students that were sent (every type, document requests too) |
| Applications over time | `charts.overTime`: one entry per day (the period, or the last 30 days) |
| Outcome distribution | `charts.outcomes` (always the three) |
| By program | `charts.programs`, most applications first; `offerRate` = offers / assessed |
| Assessment performance | `charts.assessments`: runs per day, failed runs, average seconds (`null` on days without a completed run) |

Rates are `null` when there are no applications.

#### `GET /v1/reports/export`

The **Export CSV** button. Not JSON: it answers a CSV file (`Content-Type: text/csv`, `Content-Disposition: attachment; filename="applications-2026-10-25.csv"`), one row per application, newest first, at most 50,000. Columns: Application number, Student, Student email, Program code, Program, Intake, Application date, Submitted at (UTC), Status, Assessment, Outcome, Confidence (%), Decided by (`AI` or the person), Decision reason, Missing documents, Officer.

The token is needed, so download it with `fetch`, not a plain link:

```js
const res = await fetch(`${API_BASE_URL}/reports/export?${new URLSearchParams(filters)}`, {headers: {Authorization: `Bearer ${localStorage.getItem("token")}`}});
if (!res.ok) throw new Error((await res.json()).message); // errors are JSON as usual
const url = URL.createObjectURL(await res.blob());
Object.assign(document.createElement("a"), {href: url, download: "applications.csv"}).click();
URL.revokeObjectURL(url);
```

The file opens in Excel with accents intact (UTF-8 with BOM); cells that look like formulas are written as text.

### AI Usage

How many tokens your institution's AI calls used and what they cost, for an **AI Usage** page. Every AI call (document extraction, eligibility assessment, ...) is logged automatically by the backend; the API only reads. Needs the **AI Usage** permission (`ai_usage`, read only): by default Super Admin and Institution Admin.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/v1/ai-usage/summary` | Totals, a daily chart, and the split by model and by operation |
| `GET` | `/v1/ai-usage` | The log of calls, newest first, paginated |

Both take the same filters, all optional (the daily chart `byDay` follows only the period):

| Param | Notes |
|---|---|
| `from`, `to` | `YYYY-MM-DD`, both days included. Without them: all time (the daily chart shows the last 30 days) |
| `utcOffset` | The viewer's offset from UTC in minutes, as on the dashboard: `-new Date().getTimezoneOffset()` |
| `operation` | `extraction`, `extraction_fallback`, `assessment`, `assessment_escalation` (`document_verification` is accepted but not used yet) |
| `modelId` | From `GET /v1/settings/options` → `aiModels` |
| `applicationId` | One application's AI cost |
| `status` | `success` or `failed` |
| `page`, `limit` | `GET /v1/ai-usage` only: default `1` and `20`, max `100` |

#### `GET /v1/ai-usage/summary`

```json
{
  "period": {"from": null, "to": null, "utcOffset": 330},
  "totals": {
    "requests": 128, "failed": 2, "inputTokens": 1840000, "cachedInputTokens": 320000, "outputTokens": 210000,
    "totalTokens": 2050000, "unpricedRequests": 0, "costUsd": 4.835
  },
  "byDay": [{"date": "2026-10-24", "requests": 12, "tokens": 190000, "costUsd": 0.41}],
  "byModel": [{"modelId": 2, "modelCode": "gpt-5.6-terra", "modelName": "GPT-5.6 Terra", "providerName": "OpenAI (ChatGPT)", "requests": 80, "tokens": 1500000, "costUsd": 3.9}],
  "byOperation": [{"operation": "assessment", "label": "Eligibility assessment", "requests": 64, "tokens": 1200000, "costUsd": 3.1}]
}
```

- **Cost is in US dollars** (`costUsd`), worked out from the model's prices when the call was made, so later price changes do not change past costs. Show it with up to 4 decimals for small amounts (`$0.0021`).
- `costUsd` is `null` when none of the calls in that group has a price (the model's price is not set yet). `totals.unpricedRequests` counts calls without a cost; when it is above 0, show "some costs unknown".
- `tokens` / `totalTokens` = input + output. `cachedInputTokens` are part of `inputTokens` (cheaper re-sent context).
- `byDay` has one entry per day of the range, with `0` requests on quiet days, ready for a chart.

#### `GET /v1/ai-usage`

Response `data`: `{items, total, page, limit}`. One item:

```json
{
  "id": 912,
  "operation": "assessment",
  "operationLabel": "Eligibility assessment",
  "model": {"code": "gpt-5.6-terra", "name": "GPT-5.6 Terra", "provider": "OpenAI (ChatGPT)"},
  "status": "success",
  "errorMessage": null,
  "inputTokens": 12000, "cachedInputTokens": 4000, "outputTokens": 900, "totalTokens": 12900,
  "costUsd": 0.0271,
  "durationMs": 2400,
  "application": {"id": 21, "applicationNumber": "APP-14551705"},
  "documentId": null,
  "triggeredBy": {"id": 5, "name": "Riya"},
  "providerRequestId": "req_abc123",
  "createdAt": "2026-10-24T11:00:00.000Z"
}
```

`triggeredBy` is the user who started it (**Run Assessment**, or the submit / return for reassessment that started it automatically); `null` when there was none. `application` is `null` for calls not tied to one.

Model prices (USD per 1 million tokens) are in `GET /v1/settings/options` → `aiModels[]`: `inputPricePer1m`, `cachedInputPricePer1m`, `outputPricePer1m` (`null` = not set yet), e.g. to show the price next to the model dropdowns.

Errors: `422` for a bad filter or date, `{ "from": "From must be on or before to" }`; `403` `"You do not have permission to read ai usage"`.

### Audit logs

Every create, update and delete made in the app is logged automatically. Each log records who made the change, when, and on which record. For an update it also records each changed field, from → to. The logs are read only.

**Who sees what:** every role can open Audit Logs. The **Super Admin** sees every change in the tenant. Everyone else sees only the changes they made themselves.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/v1/audit-logs` | Logs, newest first, paginated |
| `GET` | `/v1/audit-logs/options` | Values for the Module and Action filter dropdowns |

#### Filters (query string of `GET /v1/audit-logs`)

| Param | Notes |
|---|---|
| `page`, `limit` | Default `1` and `20`, `limit` max `100` |
| `module` | `applications`, `reviews`, `letters`, `programs`, `campuses`, `letter_templates`, `email_templates`, `eligibility`, `users`, `roles`, `settings` |
| `action` | `create`, `update`, `delete` |
| `entityType` + `entityId` | One record's history, e.g. `?entityType=program&entityId=12`. Types: `tenant` (Platform panel changes, module `settings`), `application`, `student`, `applicationDocument`, `manualReview`, `applicationDocumentRequest`, `program`, `campus`, `letterTemplate`, `emailTemplate`, `user`, `eligibilitySet`, `eligibilitySetVersion`, `eligibilityCriterion`, `eligibilityCriterionDocument`, `eligibilityDocumentRequirement`, `applicationNote`, `applicationLetter`, `assessmentCriterion`, `role`, `settings` |
| `userId` | Changes made by one user (useful for the Super Admin only) |
| `from`, `to` | `YYYY-MM-DD`, both days included, in UTC |
| `search` | Part of the record's label or the user's name |

```js
const {items, total} = await api("/audit-logs?module=programs&action=update&page=1&limit=20");
```

Response `data`: `{items, total, page, limit}`. One item:

```json
{
  "id": 142,
  "module": "programs",
  "action": "update",
  "entityType": "program",
  "entityId": 12,
  "entityLabel": "MSCDS - MSc Data Science",
  "changes": {
    "duration": {"from": "1 year", "to": "2 years"},
    "status": {"from": "draft", "to": "active"}
  },
  "userId": 5,
  "userName": "Riya",
  "ipAddress": "::1",
  "requestId": "3f2c...",
  "createdAt": "2026-10-23T10:15:00.000Z"
}
```

How to show it:

- **`changes`** is `{field: {from, to}}` with the API field names (`duration`, `campusId`, ...). For a **create** every `from` is `null`. For a **delete** every `to` is `null`, and `from` holds the values the record had. Keys can come in any order. A user id (`reviewerId`, `submittedBy`, ...) comes with `fromName` / `toName`; other ids stay ids (`campusId: 3`).
- Passwords never appear: `passwordHash` shows only `"***"`.
- A change of a role's permissions is one entry with `entityType` `role`, the role name as `entityLabel`, and keys like `"programs.delete": {"from": false, "to": true}`.
- **`entityLabel`** is the record's name at the time: the program as `CODE - Name`, a user's email, a version as `Version 2`. It stays readable after the record is deleted. It can be `null`.
- **`userId` / `userName` `null`** means the system made the change, e.g. the tenant's first Super Admin, who is created by a script. Show "System".
- `userName` is the user's name at the time of the change.
- One click can write several logs. For example, deleting an eligibility set also logs its versions and criteria. Logs from one request share the same `requestId`, so you can group them.
- A good row text: `Riya updated program "MSCDS - MSc Data Science": duration 1 year → 2 years, status draft → active`.

#### `GET /v1/audit-logs/options`

```json
{
  "modules": [{"code": "programs", "name": "Programs"}, {"code": "campuses", "name": "Campuses"}],
  "actions": [{"value": "create", "label": "Created"}, {"value": "update", "label": "Updated"}, {"value": "delete", "label": "Deleted"}]
}
```

#### Audit log errors

| Status | When | Body |
|---|---|---|
| `422` | Unknown `module`, `action` or `entityType`, or a bad date | `errors` = `{ field: message }` |
| `403` | The role lacks the Audit Logs permission | `errors[0].message`: `"You do not have permission to read audit logs"` |

### Firmli staff: switch tenant / user

For **Firmli staff** only: a **Super Admin** of the **platform tenant** (Firmli's own) can see the app as any client's user, without their password, e.g. to help a client. Everyone else, other roles of the platform tenant too, gets `403` `"Only a Firmli Super Admin can use the Platform panel or switch users"`. Show the menu item only when `user.tenant.isPlatform` is `true` and `user.role` is `"super_admin"` (in login and `GET /v1/auth/me`).

| Method | Path | What it does |
|---|---|---|
| `GET` | `/v1/dev/users` | Every tenant with its users, Super Admins first: `[{id, name, isPlatform, users: [{id, name, email, role, status}]}]` |
| `POST` | `/v1/dev/switch-user` | Body `{ "userId": 12 }`. Answers like login: `{user, token}`, and a session cookie of that user |
| `POST` | `/v1/auth/switch-back` | **Back to Firmli**: ends the switched session, answers `{user, token}` of the staff member (and their session cookie) |

- **Switch user:** send the chosen user's id. Only an `active` user; any other status answers `409`, e.g. `"User is inactive"` (a new user must log in once first). Switching never counts as that user's login.
- **Switch tenant:** pick that tenant's Super Admin from `/v1/dev/users` (`users.find(u => u.role === "super_admin")`) and switch to that user.
- **Every switch is in the client's audit log**: their Super Admin sees "user updated, switchedInBy: Riya (riya@firmli.com, Firmli)".
- After a switch, store the new token, clear all cached data and reload the app, so nothing from the previous tenant stays on screen.
- **Back to my account:** after a switch the browser's session is the client user's (they are not Firmli staff). A **Back to Firmli** button calls `POST /v1/auth/switch-back` with that token: no password needed, while the staff member is still a platform Super Admin; store the new token, clear the cached data and reload. To switch to another user, switch back first. From a session that was not switched into it answers `409` `"This session was not switched into from another user"`.

In the app this is the **Switch tenant / user** item in the header's user menu: a Tenant dropdown (switches to that tenant's Super Admin) and a User dropdown (users of the chosen tenant).

### Firmli staff: Platform admin panel

A small admin area for Firmli staff, next to Switch tenant / user: every client tenant with its user count, **create** a tenant (with its first Super Admin), **add users** to it, **block / unblock** it, or **remove** it. Same rule: only a Super Admin of the platform tenant (`user.tenant.isPlatform` and `user.role === "super_admin"`); everyone else gets `403`.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/v1/platform/tenants` | Tenants, platform tenant first, then by name: `{items, total, page, limit, counts}` |
| `POST` | `/v1/platform/tenants` | **New tenant** with its first Super Admin |
| `GET` | `/v1/platform/tenants/:id` | One tenant with its `users` |
| `PATCH` | `/v1/platform/tenants/:id` | Change `name`, `code`, `contactEmail`, or `status` (`active` / `blocked`) |
| `DELETE` | `/v1/platform/tenants/:id` | **Remove** the tenant and its users |
| `POST` | `/v1/platform/tenants/:id/users` | **Add user** to that tenant: `{name, email, password, roleId, status?}` as in [Users](frontend-guide-01.md#user-fields) |
| `POST` | `/v1/platform/tenants/:id/users/:userId/send-credentials` | **Send by Email** the login details to that user, e.g. right after creating a tenant: `{password}` (their current one, as shown after creating). Same answer and errors as the Users page's Send by Email; a blocked institution answers `409` with `code` `TENANT_BLOCKED` |
| `GET` | `/v1/platform/options` | `statuses` and `roles` (`[{id, code, name}]`) for the dropdowns |

List query: `page`, `limit`, `status`, `search` (name, code or contact email). `counts` = `{"active": 5, "blocked": 1}`. One tenant:

```json
{
  "id": 10, "name": "Apex Study Abroad", "code": "APEX", "contactEmail": "office@yopmail.com",
  "status": "active", "isPlatform": false,
  "userCount": 4, "activeUserCount": 3, "applicationCount": 25,
  "lastLoginAt": "2026-10-25T09:05:49.000Z", "createdAt": "2026-10-23T06:10:00.000Z"
}
```

`GET /v1/platform/tenants/:id` adds `users: [{id, name, email, roleId, role, roleName, status, lastLoginAt, createdAt}]`, Super Admins first.

**New tenant:**

```js
const tenant = await api("/platform/tenants", {method: "POST", body: {
  name: "Apex Study Abroad", code: "APEX", contactEmail: "office@yopmail.com",
  admin: {name: "Riya Kapoor", email: "riya@yopmail.com", password: "TempPass123"},
}});
```

- `name` and `admin` (name, email, password 8 to 72) are required; `code` (2 to 20 of A-Z, 0-9, `-`, stored in capitals) and `contactEmail` are optional.
- Creates the tenant, its default Settings and the Super Admin (`inactive` until their first login), all or nothing. Answers `201` with the tenant and its `users`. Then show **Send by Email** as for any new user, or share the password yourself.
- `409`: `"Institution code already exists"` / `"Email is already registered"` (emails are unique across all tenants).

**Block:** `PATCH {"status": "blocked"}`. All of that tenant's users are logged out at once (`401` `"Your institution's account is blocked; contact Firmli"`), login answers `403` with that message, and nobody can switch into it. `{"status": "active"}` gives access back. The tenant's data stays as it is.

**Remove:** `DELETE`. The tenant and its users disappear (soft delete: the data stays in the database), their logins stop, and the code and the users' emails can be used again. Ask for confirmation first, e.g. "Type the tenant's name to remove it". Blocking is the safer first step.

- The platform tenant itself can be neither blocked nor removed: `409` `"The platform tenant cannot be blocked or removed"`.
- Every change is in that tenant's own audit log (Settings module, `entityType` `tenant`), by the staff member who made it; added users appear as user creations.
