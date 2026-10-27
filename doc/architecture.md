# Firmli AI Offer Letter Backend: Architecture

How the backend is built: what each part uses and how it works, from a request coming in to an email going out. For the API itself (endpoints, fields, errors) see the frontend guide, parts [01](frontend-guide-01.md), [02](frontend-guide-02.md), [03](frontend-guide-03.md), [04](frontend-guide-04.md) and [05](frontend-guide-05.md). For setup see the [README](../README.md).

## Tech stack

| Area | Technology |
|---|---|
| Runtime | Node.js, ES modules (`import` / `export`) |
| Web framework | Express 4 |
| Database | MySQL 8 (local: Docker container `firmli-mysql`) |
| ORM | Sequelize 6 (mysql2 driver), used for writes only; reads are raw SQL |
| Validation | Joi |
| Login | Access tokens: JSON Web Tokens (jsonwebtoken, HS256, 15 min); sessions with rotating refresh tokens in an httpOnly cookie; passwords hashed with bcryptjs |
| Security headers / CORS / rate limit | helmet, cors, express-rate-limit |
| File storage | AWS S3 (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`) |
| File uploads | multer (in memory, then to S3) |
| Email | nodemailer over SMTP |
| PDF | pdfmake + html-to-pdfmake (+ jsdom): HTML letters to PDF in plain JavaScript, no browser |
| AI | OpenAI Responses API over `fetch` (each client's own key); mammoth reads DOCX to text |
| Logging | pino + pino-http (pino-pretty in development) |
| Config | dotenvx (env files), validated with Joi at boot |
| Secrets in the database | AES-256-GCM (Node `crypto`) with `ENCRYPTION_KEY` |
| Utilities | lodash |

## Folder structure

```
bin/www                     Starts the server: connects the database, marks interrupted AI runs failed, listens, shuts down cleanly on SIGTERM / SIGINT
database/
    schema.sql              The full current schema, for a fresh database
    migrations/00N_*.sql    Every change, in order, for existing databases
scripts/
    create-tenant.js        Creates a client company (tenant), its settings and its first Super Admin
    platform-tenant.js      Marks Firmli's own tenant (its users may switch tenant / user)
    seed-locations.js       Fills countries / states / cities
doc/                        Frontend guide (API) and this file
src/v1/
    firmliOfferLetterApp.js The Express app: middlewares and route mounts
    configs/env.config.js   Every env variable, validated at boot -> `config`
    routes/                 URL -> middlewares -> controller
    controllers/            Read the request, call a service, send the response
    services/               Business rules and database access, one object per file
    models/client/          Sequelize models (auto-loaded), used to create / update / delete
    schemas/validations/    Joi schemas, one object per file
    middlewares/            authenticate / authorize, validate, upload, request logger, error handler
    helpers/                Shared building blocks: db, email, storage (S3), openai, criteria, crypto, date, audit, response, template
    emails/                 The content of each email (subject, HTML, text)
    constants/              Enums, labels and fixed lists
    utils/                  ApiError, asyncHandler, logger, database connection, request context
```

## How a request flows

```
Request
  -> requestLogger      gives it an id (X-Request-Id header, req.log), logs one line when it ends
  -> helmet, cors, express.json (max 1 MB)
  -> authenticate       Bearer token -> req.user (user, tenant, role, permissions); 401 if missing or invalid
  -> authorize(MODULE)  GET = read, POST = create, PATCH / PUT = update, DELETE = delete; 403 if not allowed
  -> validate(schema)   Joi on body / query / params; 422 with {field: message}
  -> controller         asyncHandler(...): passes req.user.tenantId and the values to the service
  -> service            rules + raw SQL reads (dbHelper) + model writes (Sequelize)
  -> responseHelper     {statusCode, data, message, success}
Errors anywhere -> customError middleware -> {statusCode, message, errors, success: false}
```

Routes are mounted in `firmliOfferLetterApp.js`, for example:

```js
firmliOfferLetterApp.use("/v1/programs", authenticate, authorize(MODULES.PROGRAMS), programRouter);
```

## Code conventions

- **One object per file** for services, helpers and validations: `const programService = {list, getById, create, ...}; export default programService`. Helpers a service needs are methods of the same object.
- **Reads are raw SQL** through `dbHelper.select / selectOne / selectOneOrFail` with `:named` values (never string concatenation of user input). **Writes go through the Sequelize models**, so the audit log hooks run.
- **Errors**: `throw ApiError.of(HTTP_RESPONSES.HTTP_NOT_FOUND, "Program not found")`, or `throw ApiError.validation({cityId: "City not found"})` for field errors (422).
- **No comments** in models, Joi schemas and `schema.sql`. Elsewhere a comment explains *why*, not *what*.
- **lodash** where it is clearer (`_.pick`, `_.groupBy`, `_.mapValues`, ...).
- **Shared pieces to reuse** instead of writing them again:
  - `dbHelper.paginate` (count + rows at once) and `dbHelper.countsBy` (status chips) for lists;
  - `responseHelper.ok / created` in controllers, `responseHelper.labelOptions(LABELS)` for `[{value, label}]` dropdowns;
  - `settingsService.flags(tenantId)` for the automation / approval switches and email retries;
  - `decisionHelper` whenever an application's decision changes (it supersedes the current letter);
  - `applicationService.findInTenant` for "application of this tenant or 404";
  - `dateHelper.inPeriodSql / inRangeSql` for day filters (they keep the column bare so its index applies).
- **Dropdowns** go in their own module (`routes/dropdown.route.js` → `dropdownService`, mounted at `/v1/dropdowns` behind `authenticate` only): one route per list, each answering `[{value, label}]` of the user's tenant sorted by label, with optional filters validated in `dropdownValidation`.

## Multi-tenancy

Each client company is a **tenant**. Every user belongs to one tenant, and every tenant-owned table has `tenant_id`.

- The tenant always comes from the logged in user (`req.user.tenantId`); the frontend never sends it.
- Every query filters on `tenant_id`, and every unique key starts with it, so two tenants can both have a program `MSDS`.
- Shared lists are the same for every tenant and have no `tenant_id`: countries / states / cities, letter variables, document types, eligibility categories, roles, modules, AI models.
- There is no signup. `npm run create-tenant` creates a tenant, its settings row and its first Super Admin.
- **Platform tenant**: Firmli's own tenant has `tenants.is_platform = 1` (set once per database with `npm run platform-tenant -- <id or code>`; never by id, since ids differ between databases). Its users are Firmli staff: only its Super Admins pass `platformOnly` (any other role of it gets `403`) and may use `/v1/dev/switch-user` to act as any client's active user. Each switch is audit logged in the client's tenant (`switchedInBy`) and does not count as the client user's login.
- **Platform admin panel** (`/v1/platform`, `services/platform.service.js`, also `platformOnly`): list tenants with user and application counts, create a tenant (tenant + default settings + first Super Admin in one transaction; `npm run create-tenant` uses the same function), add users to a tenant, block / unblock (`tenants.status`: a blocked tenant's users cannot log in and their tokens stop, checked in login and `authenticate`), and remove (soft delete of the tenant and its users). The platform tenant cannot be blocked or removed. Changes are audit logged in the target tenant as `tenant` entries.

## Login and users

- `POST /v1/auth/login` checks the bcrypt hash, starts a **session** (`user_sessions`, `services/session.service.js`) and returns an **access token** (JWT, `JWT_EXPIRES_IN`, 15 minutes) holding only the user id, the user's `token_version` and the session id (`sid`). The **refresh token** (32 random bytes) goes into the httpOnly cookie `firmli_refresh` (path `/v1/auth`, `COOKIE_SAME_SITE` / `COOKIE_SECURE` / `COOKIE_DOMAIN`); only its SHA-256 hash is stored.
- `POST /v1/auth/refresh` gives a new access token and a **new refresh token** (rotation, the row locked with `FOR UPDATE`); the session's 30 days (`REFRESH_TOKEN_DAYS`) start again. The replaced token (`previous_token_hash`) still works for 30 seconds (two tabs refreshing at once, no new cookie); later it means a copied token, and the session is ended (`end_reason` `reuse`). A user who may no longer log in ends the session with their refusal code. The cookie routes check `Origin` against `CORS_ORIGINS` (`fromAllowedOrigin`).
- `authenticate` reads the user again on **every request** (`authService.sessionUser`, also used by refresh and the events stream), so a deleted, blocked or role-changed user is affected at once. A token whose version is not the user's current `token_version`, or whose session has ended, is refused (one query: the session check is an `EXISTS` in it).
- **Ending sessions**: logout ends this device's session; logout-all, reset password and an admin setting a password end every session (and add 1 to `token_version`); change password ends every other session and gives this one a new access token. **Switch user** (Firmli staff) starts a session of the client user with `actor_user_id`; `POST /v1/auth/switch-back` ends it and starts one for the staff member again, while they are still a platform Super Admin.
- **Forgot / reset password** (`services/auth.service.js`): a random 32-byte token is emailed as `<FRONTEND_URL>/reset-password?token=...`; only its SHA-256 hash is stored in `password_resets` (60 minutes, one use, a new request expires the older ones). The answer is the same for unknown emails, and emails go out in the background, so neither the answer nor its timing tells who has an account. After a change or reset the user gets a "password was changed" email.
- Rate limits per network per 15 minutes: 10 failed logins, 10 wrong current passwords, 10 invalid reset links, 5 forgot-password requests.
- User status: a new user is `inactive` until their first login makes them `active`. `banned`, `blocked`, `deactivated` and `deleted` cannot log in.

## Roles and permissions

- Five global roles: Super Admin, Institution Admin, Admissions Officer, Reviewer, Read Only.
- Each role has create / read / update / delete switches per **module** (programs, applications, users, settings, ...).
- `role_module_permissions` holds the defaults. A tenant's Super Admin can change them for that tenant only (`tenant_role_permissions`), and **reset** a role to the defaults (its tenant rows are removed). The Super Admin role itself can never be changed, and only a Super Admin can manage another Super Admin.
- `authorize(MODULES.X)` checks the switch that matches the HTTP method. In a module without create (`ACTIONS_BY_MODULE`: Manual Review, Roles, Settings) a `POST` is an action on an existing record and needs update, so those routers are mounted with `authorize` like the others. A route can still name the action, e.g. `authorize(MODULES.LETTERS, "update")` for approve.

## Database

- **MySQL**, accessed through Sequelize. Models in `src/v1/models/client` are loaded automatically at boot.
- Connection pool per process: `FIRMLI_DB_POOL_MAX` (default 10; one dashboard load runs about 10 queries at once). Every API server and worker has its own pool: keep (servers + workers) × pool below MySQL's `max_connections` (151 by default, much less on small RDS). `decimalNumbers` is on: DECIMAL columns and `SUM` / `AVG` come back as numbers (or null), so no `Number()` is needed. A `SUM` over no rows is still null: wrap it in `COALESCE(..., 0)` when 0 is meant.
- **Indexes for date filters**: compare the bare column (`a.submitted_at >= :from - INTERVAL :utcOffset MINUTE`, what `dateHelper.inPeriodSql / inRangeSql` write), never a function of it, so `(tenant_id, submitted_at)` / `(tenant_id, created_at)` can be used. Lists sorted newest first order by the indexed time column, then `id`.
- **Migrations**: every change is a new numbered file in `database/migrations`, and the same change goes into `database/schema.sql`. A fresh database runs `schema.sql`; an existing one runs the migrations it does not have yet.
- **Soft delete everywhere**: every table has `deleted_at`, models are `paranoid`, and a delete only sets `deleted_at`. Unique keys end with a generated column `not_deleted` (1 when live, NULL when deleted), so a deleted row never blocks a new one with the same value. Every raw SELECT filters `deleted_at IS NULL`.
- **Tenant-safe foreign keys** (migration 037): a tenant-owned parent has `UNIQUE (tenant_id, id)` and a child of the same tenant references it as `FOREIGN KEY (tenant_id, x_id) REFERENCES parent (tenant_id, id)`, so the database refuses a row pointing to another tenant's program, student, user, template, case, run or letter even if the code forgot a check. Rules the code relies on also have a key: one letter per version (`uq_application_letters_version`), one result per criterion in a run, and at most one published and one draft eligibility version per set (generated columns `live_published` / `live_draft`, like `manual_reviews.open_case`). New tables follow the same pattern.
- **Sort order** of shared lists uses gaps (10, 20, 30) so a new row can go in between without renumbering.

## Transactions

When one action writes several rows (e.g. delete an eligibility set with its versions and criteria), they run in one **transaction**: all of them are saved, or none.

**Who opens it**: the service method that handles the whole action, never a controller, helper or model. A service method called *inside* someone else's transaction does not open its own; it takes the transaction as its **last parameter**.

**How it is passed**: explicitly, as an argument. Sequelize's automatic propagation (CLS) is not used, so every call that should be part of the transaction must receive it:

| Call | How the transaction is passed |
|---|---|
| Model write | `databaseModel.program.update(values, {where: {id}, transaction})`, the same for `create`, `destroy`, `bulkCreate` |
| Raw read (`dbHelper`) | Third argument: `dbHelper.select(sql, replacements, {transaction})`, also `selectOne`, `selectOneOrFail` (4th), `assertUnused` (4th) |
| Another service method | Last argument: `eligibilityVersionService.copyContents(fromId, toId, transaction)` |
| Audit log written by a service | `auditHelper.write(entry, transaction)` |
| Audit log of a model write | Nothing to do: the hook receives the write's `options.transaction` and writes the log row in it |

```js
// eligibilityVersionService: "Duplicate From" replaces a draft's contents in one transaction (shortened)
copyFrom: async (id, sourceVersionId, tenantId) => {
    await eligibilityVersionService.findDraft(id, tenantId);              // checks before the transaction
    await databaseModel.sequelize.transaction(async (transaction) => {
        await eligibilityVersionService.removeContents([id], transaction);  // helpers take it last
        await eligibilityVersionService.copyContents(sourceVersionId, id, transaction);
    });                                                                    // commit here, or roll back on any throw
    return eligibilityVersionService.getById(id, tenantId);               // read back after the commit
},
```

**Rules**:

- Use the **managed** form `sequelize.transaction(async (transaction) => {...})`: it commits when the function finishes and rolls back when it throws, including an `ApiError` thrown on purpose. Do not call `commit()` / `rollback()` yourself.
- Inside the function, pass `transaction` to **every** query, reads included. A query without it runs on a different connection, outside the transaction: it does not see the transaction's not yet committed rows, and a write to a row the transaction has locked waits until it times out.
- Do checks and lookups that do not depend on the transaction's own writes **before** it, and read the result back **after** the commit, as above. Keep transactions short.
- `dbHelper.saveOrConflict(...)` can wrap a write inside a transaction: the unique-key clash becomes a `409` and the whole transaction rolls back.
- **S3 and email are not part of database transactions** and cannot be rolled back. Do them after the database work succeeded, or undo them when it fails: an upload is sent to S3 first and removed again if its row cannot be saved.
- MySQL's default isolation level (REPEATABLE READ) is used.

## Lists: pagination and sorting

Every list endpoint is one of these kinds.

**1. Small, bounded lists: no pagination.** Lists that stay small per tenant (campuses, users, letter / email templates, eligibility sets, roles, dropdown options, countries / states / cities) return all rows as a plain array in `data`, sorted by name, with an optional `search`. When a list can grow past a few hundred rows, it moves to kind 2.

**2. Growing lists: page / limit (offset) pagination.** Used today by `GET /v1/programs`, `GET /v1/applications` and `GET /v1/audit-logs`.

| Part | Convention |
|---|---|
| Query | `page` (default `1`) and `limit` (default `20`, max `100`). Validation: spread `...common.pagination` into the list's Joi schema |
| SQL | `ORDER BY <sort> LIMIT :limit OFFSET :offset`, plus `SELECT COUNT(*)` with the same `WHERE` for the total; `dbHelper.paginate` runs both at once and sets the offset |
| Response | `data: {items, total, page, limit}`; pages = `Math.ceil(total / limit)` |
| Filters | Optional query params, each added to the `WHERE` as a `:named` value; `search` uses `dbHelper.likePattern` |

```js
list: ({page, limit, ...filters}, tenantId) => {
    const {status, search} = filters;
    const conditions = ["p.tenant_id = :tenantId", "p.deleted_at IS NULL"];
    if (status) conditions.push("p.status = :status");
    if (search) conditions.push("(p.name LIKE :search OR p.code LIKE :search)");
    const where = `WHERE ${conditions.join(" AND ")}`;
    return dbHelper.paginate({
        countSql: `SELECT COUNT(*) AS total FROM programs p ${where}`,
        rowsSql: `${PROGRAM_SELECT} ${where} ORDER BY p.id DESC LIMIT :limit OFFSET :offset`,
        replacements: {...filters, tenantId, search: search && dbHelper.likePattern(search)},
        page,
        limit,
        mapRow: programService.toResponse,
    });
},
```

**3. Very large or live feeds: cursor (keyset) pagination.** Not used yet. Use it when a list is too big for `OFFSET` (MySQL still reads every skipped row) or changes while being read, so pages shift (an infinite-scroll activity feed, audit logs in the hundreds of thousands, exports). The convention for when it is needed:

| Part | Convention |
|---|---|
| Query | `limit` (default `20`, max `100`) and `cursor` (missing for the first page). No `page`, no `total` |
| Cursor | Opaque to the frontend: base64url of JSON with the last row's sort value and id, e.g. `{"t": "2026-10-24T10:00:00Z", "id": 512}`. A cursor that does not decode answers `422 {cursor: "Invalid cursor"}` |
| SQL | `WHERE <filters> AND (created_at, id) < (:t, :id) ORDER BY created_at DESC, id DESC LIMIT :limit + 1`; the extra row only tells whether there is a next page |
| Response | `data: {items, nextCursor}`, `nextCursor` = the cursor of the last item, `null` on the last page |
| Index | One that starts with `tenant_id` and continues with the sort columns, e.g. `(tenant_id, created_at, id)` |

**Sorting**:

- Every list has a **fixed default order** documented in the frontend guide: newest first for growing lists (`id DESC`; applications by submission time), name for small lists.
- The order always ends with a **unique column** (`id`), so rows with equal values (two applications submitted in the same second) keep a stable order and are never shown twice or skipped across pages.
- User-chosen sorting is not offered yet. When a list needs it: a `sort` query param such as `name` or `-createdAt` (`-` = descending), validated with Joi against a fixed list, and mapped in the service to a column through a constant (`{name: "p.name", createdAt: "p.created_at"}`). The value is never put into the SQL as it was sent. `id` is still added last.

## Audit log

Every create, update and delete is logged in `audit_logs` without the services doing anything:

1. `authenticate` stores the user, request id and IP in an **AsyncLocalStorage** request context (`utils/requestContext.util.js`), available anywhere in that request.
2. `helpers/audit.helper.js` adds Sequelize hooks (`afterCreate`, `afterUpdate`, `afterDestroy`) to the models listed in `constants/audit.constants.js`. Bulk updates and deletes are made to run per row.
3. Each hook writes one row in the **same transaction** as the change (it receives the write's `options.transaction`, see [Transactions](#transactions)), so a rolled back change leaves no log: who, when, module, record and, for an update, `{field: {from, to}}` of the changed fields only. Passwords show as `***`.

Some saves are logged by their service as one entry instead (role permissions, settings) with `auditHelper.write(...)`. The Super Admin sees every log of the tenant; other users see only their own.

## File upload (S3)

Application documents (PDF, DOCX, JPG, PNG, at most 10 MB) are stored in **AWS S3**. The bucket stays private.

**Upload** (`POST /v1/applications/:id/documents`, multipart with `documentTypeId` and `file`):

1. `middlewares/upload.middleware.js` (multer) reads the file into memory and checks size, extension and MIME type.
2. It then checks the file's **first bytes** (its signature), so an `.exe` renamed to `.pdf` is refused. A DOCX (a ZIP) is also unpacked once with a cap (`helpers/zip.helper.js`: at most 25 MB per file inside, 60 MB in all, measured, not taken from the ZIP's own headers), so a "zip bomb" is refused before mammoth reads it; the AI assessment checks it again before reading a stored DOCX.
3. `applicationService.uploadDocument` checks that the application is a draft of this tenant and the document type exists.
4. `applicationDocumentService.create` builds the key `tenants/<tenantId>/applications/<applicationId>/<uuid>.<ext>`, sends the file to S3 with `storageHelper.save`, then saves the row in `application_documents` (original name, type, size, uploader).
5. If the row cannot be saved, the file is removed from S3 again.

**Download** (`GET /v1/applications/documents/:id/download-url`): after the usual permission and tenant checks, `storageHelper.downloadUrl` returns a **presigned link** valid for 5 minutes, which downloads the file under its original name (`{inline: true}`: the browser shows it instead, used for viewing a letter PDF and the Settings logo). Files never pass through our server on the way out.

**Code**: `helpers/storage.helper.js` is the only place that talks to S3:

```js
await storageHelper.save(key, buffer, contentType);
await storageHelper.remove(key);
const {url, expiresIn} = await storageHelper.downloadUrl(key, fileName);
```

**Config**: `S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (empty on AWS servers with an IAM role), `S3_ENDPOINT` (only for MinIO / S3-compatible storage), `S3_KEY_PREFIX` (a folder per environment when they share a bucket), `S3_DOWNLOAD_URL_EXPIRES_IN`. Without `S3_BUCKET`, uploads and downloads answer `503 "File storage is not configured"`.

## Email (SMTP)

Emails are sent over **SMTP with nodemailer**, so any provider works (AWS SES, SendGrid, Mailgun, ...) by changing settings only.

**Who sends**: every client uses **Firmli's SMTP** (`SMTP_*` in env) by default, sent in the institution's name ("Apex Study Abroad <no-reply@firmli.com>"). A client can connect **its own SMTP** in Settings (`tenant_settings.smtp_*`, password encrypted like the OpenAI key); then its emails go through its server, from its address. `emailHelper.send({tenantId, ...})` picks the sender, so no other code knows which is used. Outside development, internal hosts (localhost, private IPs) are refused as a client's SMTP server.

**Pieces**:

- `helpers/email.helper.js`: `emailHelper.send({tenantId, to, subject, html, text, replyTo})` sends with that client's sender (above). It also has `layout(...)` (a simple, email-client-safe HTML frame) and `escape(...)`.
- `src/v1/emails/<area>.email.js`: the content of each email, as an object of builders that return `{subject, html, text}`. Today: `user.email.js` → `userEmails.credentials(...)`.
- **Branded emails to students** (letters, document requests): `layout({..., brand, attachmentName})` adds a bar in the brand colour, the logo or the institution's name, a box naming the attached file and a footer with the institution's contacts. The logo is an inline image (`cid:institution-logo`, `LOGO_CID`): the stored `body_html` points to it and `communicationService.attempt` attaches the logo from S3 (`emailHelper.logoAttachment`) on every try. Transports are pooled (one per SMTP account) so sends reuse connections. Emails to staff (login details, password reset) keep the plain layout.

**How it works**, for example the "Send by Email" button after creating a user (`POST /v1/users/:id/send-credentials`):

1. `userService.sendCredentials` checks the user is in the tenant and can log in.
2. The frontend sends the password it showed; it must match the user's bcrypt hash (`authService.isCurrentPassword`), so nobody can mail fake credentials.
3. `userEmails.credentials(...)` builds the subject, HTML and plain text. Every value goes through `emailHelper.escape`, and the login link is built from `FRONTEND_URL` (never taken from the request).
4. `emailHelper.send(...)` sends it, with the institution's contact email (Settings) as reply-to.

**Adding a new email**:

```js
// src/v1/emails/application.email.js
const applicationEmails = {
    submitted: ({studentName, applicationNumber}) => ({
        subject: `Application ${applicationNumber} received`,
        html: emailHelper.layout({title: "Application received", body: `<p>Hi ${emailHelper.escape(studentName)}, ...</p>`}),
        text: `Hi ${studentName}, ...`,
    }),
};

// in a service
await emailHelper.send({to: student.email, ...applicationEmails.submitted({studentName, applicationNumber})});
```

**Config**: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` (true for port 465), `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, `FRONTEND_URL`. Without `SMTP_HOST`, sending answers `503 "Email is not configured"`; a refusing mail server gives `502`. For local testing, a Mailpit container (`axllent/mailpit`) catches emails instead of delivering them.

## Applications

- A **student** is one row per email per tenant, reused when they apply to more programs.
- An **application** is a draft while the wizard runs (edit, upload documents, delete), then **submitted** once. Submitting locks the program's published eligibility criteria version, so later rule changes do not affect it.
- Application numbers are `APP-` + 8 random digits, unique per tenant.
- Status, assessment status, outcome and confidence are filled by the AI assessment (next section).

## AI assessment

`services/assessment.service.js`, OpenAI through `helpers/openai.helper.js` (Responses API with `fetch`, structured outputs: the answer must match a JSON schema). Each tenant's own key from Settings is used.

```
POST /v1/applications/:id/assess  (or submit / return for reassessment, when automatic assessment is on)
  -> start: checks, creates the application_assessments row, application -> processing / in_progress, answers 202
  -> a job in the Redis queue (BullMQ); a worker picks it up, at most QUEUE_CONCURRENCY at a time:
       1. extract   every document, 3 at a time: extraction model reads it (PDF / image as is, DOCX as text via mammoth);
                    confidence < 0.9 -> the fallback model reads it again
       2. findValues the assessment model finds the applicant's value + evidence for each criterion;
                    a mandatory criterion without a value or with confidence < 0.8 -> the escalation model tries again
       3. evaluate  helpers/criteria.helper.js compares value and requirement IN CODE (met / not_met / unclear)
       4. decide    Settings rules: mandatory not met -> rejection; all met -> conditional_offer;
                    unclear / low confidence / missing, mismatched or unreadable document -> manual_review
       5. save      one transaction: extractions, criteria results, the run, the application,
                    and a Manual Review case (default reviewer) when it needs a person
  -> any error: fail -> run failed, application back to submitted / failed
```

- **The AI never decides.** It only reads values; the comparison and the outcome are code, so they are repeatable and explainable (each criterion keeps its value, evidence, source document and confidence).
- Tables: `application_assessments` (one row per run), `application_document_extractions` (what was read from each document), `application_assessment_criteria` (one result per criterion). Every run is kept as history.
- Every AI call is logged in `ai_usage_logs` with the run's `assessment_id`, so each run shows its tokens and cost.
- **Job queue** (`helpers/queue.helper.js`, BullMQ on Redis, `REDIS_URL`): `POST /assess` only adds a job (`jobId` = `assessment-<id>`, never queued twice) and answers 202. Workers run jobs, `QUEUE_CONCURRENCY` (default 3) at a time per worker process. The OpenAI key is not put in Redis: the job reads it from the database.
- **Retries:** a temporary failure (OpenAI 408 / 429 / 5xx or unreachable, file storage down) throws, and BullMQ tries the whole run again 1, 2, then 4 minutes later (4 tries). A permanent one (wrong key, bad request) or the last try marks the run failed at once.
- **Crashes and restarts:** a job a crashed worker left is picked up again by BullMQ; at startup `recoverInterrupted()` queues every run still `in_progress` again (a finished job with the same id is replaced). Without `REDIS_URL` jobs run inside the API process and such runs are marked failed instead.
- **Where workers run:** by default inside the API process (`QUEUE_WORKER=true`). To scale, set `QUEUE_WORKER=false` on the API servers and run `npm run production_worker` (same image, other command) as many times as needed. Each worker process also listens for automation events (auto letter / email), since those follow the runs it finishes.
- Redis must keep keys (`maxmemory-policy noeviction`); `QUEUE_PREFIX` keeps this app's keys apart in a shared Redis. `GET /v1/health` shows `queue`: `up`, `down` or `not_configured`.
- Prompts: `constants/ai-prompts.constants.js`; a tenant's own prompts in Settings replace them.
- **Extract one document** (`assessmentService.extractDocument`): the same `extract` step for one document, on request and synchronous. The reading is saved in `application_document_extractions` with `assessment_id` NULL and `requested_by`; it never changes the application or a run.

## Manual Review Queue

- `manual_reviews` holds one **case** per application that needs a person (application status `manual_review`): reason, flags, priority, reviewer, status (`unassigned` → `assigned` → `in_review` ⇄ `waiting_documents` → `resolved`) and how it was resolved. A generated column `open_case` in a unique key allows only one open case per application.
- Cases are opened by the AI assessment (with the Settings default reviewer, they start assigned). The migration opened one for every application already in manual review.
- Actions (`services/manualReview.service.js`): **assign**; **request documents** (records an `application_document_requests` row, emails the student and sets the case to `waiting_documents`; the row is kept with `email_status` `failed` / `not_configured` when the email cannot go out); **return for reassessment** (resolves the case and sends the application back to `submitted` / assessment `pending`, in one transaction); **override a criterion** (`application_assessment_criteria.override_*`, the AI's `result` kept; audit logged by the service as `assessmentCriterion`); **decide** (resolves the case as `approved` / `rejected` and completes the application).
- While an application is in manual review, documents can still be uploaded to it; an upload moves a `waiting_documents` case back to `in_review`.
- **Decisions**: `applications.decision_source` is `ai` (set by the assessment) or `manual` (a Manual Review decision, or **Change outcome** `PUT /v1/applications/:id/outcome` on a completed application), with `decided_by`, `decided_at` and `decision_reason`. Going back to the AI clears them (`NO_DECISION`). A run's `suggestedOutcome` is the criteria's verdict with the overrides, a hint only.
- **Notes** (`application_notes`, `services/applicationNote.service.js`): on the application page (Applications create) or on a case (Manual Review update, `review_id` set). Never edited or deleted through the API.

## Settings and dashboard

- **Settings**: institution details live on `tenants`; automation, decision safety, default reviewer, email retries and AI configuration live in `tenant_settings`, one row per tenant.
- **Each client's own OpenAI key** is in `tenant_settings`, **encrypted** by `helpers/crypto.helper.js` (AES-256-GCM with `ENCRYPTION_KEY`, stored as `v1:iv:tag:data`). Only its last 4 characters are kept readable, for the masked `sk-...abcd`. The API never returns it and the audit log shows `***`. The AI code gets it with `settingsService.openaiApiKey(tenantId)`. Changing `ENCRYPTION_KEY` makes saved keys unreadable, so it is set once per environment.
- **Dashboard** (`GET /v1/dashboard`): one call with every count, rate, chart, list and activity, built with aggregate SQL. It takes an optional period, program and the viewer's UTC offset. Average processing time is the average duration of completed assessment runs.
- **Activity** (`GET /v1/applications/:id/activity`, `services/applicationActivity.service.js`): one SQL `UNION` of the audit log rows of the application and everything that belongs to it, plus each assessment run's start and end, newest first, with a readable `title` per event.
- **Reports** (`GET /v1/reports`, `/v1/reports/export`, `services/report.service.js`): KPIs and charts with aggregate SQL, and a CSV of the applications (`helpers/csv.helper.js`: UTF-8 BOM for Excel, formula-like cells written as text). The CSV **streams**: `reportService.exportCsv` is an async generator that reads 1,000 rows at a time (keyset on `submitted_at, id`, using `idx_applications_tenant_submitted`; the cursor time is read as text so it compares exactly), and the controller writes each batch, waits for `drain`, stops when the download is closed, and cuts the download if a later batch fails (the first batch is read before anything is sent, so early errors are normal JSON). Memory stays at one batch and other requests run between batches; at most 50,000 rows per download. Period SQL is shared with the dashboard (`dateHelper.localSql` / `inPeriodSql`).
- **Notifications** (`GET /v1/notifications`, `services/notification.service.js`): counts for the topbar bell. Each count names the module and action it needs, and only the ones the user's role may see are returned.

## Letters (PDF)

`services/letter.service.js`, module `letters` (create = generate, read = see / download, update = approve / reject).

```
POST /v1/applications/:id/letters
  -> letter type from the application (completed: its outcome; manual_review: Manual Review)
  -> the program's published template for that type
  -> values: application, student, program, institution, signatory, plus HTML built from the latest assessment
     ({{eligibility_table}}, {{document_checklist}}, {{conditions}}, ...); every value is HTML-escaped
  -> helpers/pdf.helper.js: HTML -> pdfmake document -> PDF buffer (A4; letterhead with the logo and institution details over a brand-colour line on every page; footer with contacts + page numbers)
  -> S3: tenants/<t>/applications/<a>/letters/<reference>.pdf
  -> one transaction: older letters of the application -> superseded, new row (pending_approval, or approved by Settings)
```

- `application_letters` keeps the letter as generated (subject, header, body, footer HTML) and the PDF's S3 key, so a later template change never alters a sent letter. Reference: prefix + application number digits + version, unique per tenant.
- A changed decision (Change outcome, Manual Review decision, new assessment, return for reassessment) marks the current letter superseded in the same transaction, through `helpers/decision.helper.js` (`clear`, `recordManual`, `supersedeLetters`).
- **PDF without a browser** (no Puppeteer / Chrome): pdfmake draws the PDF; html-to-pdfmake converts the HTML, with jsdom as its DOM. Remote URLs are never fetched and only pdfmake's own font files may be read (`setUrlAccessPolicy` / `setLocalAccessPolicy`); images must be inline PNG / JPEG data, others are removed before conversion. Layout CSS (flex, grid) is not supported.
- **Branding**: `tenants.logo_storage_key` (uploaded with `PUT /v1/settings/logo`, PNG / JPG up to 2 MB, stored under `tenants/<id>/branding/`) and `tenants.brand_color`. `letterService.brandOf` reads the logo from S3 as inline data (a logo that cannot be read leaves the letter without it) and passes it with the colour and the institution's details to `pdfHelper.fromHtml`. The helper draws the letterhead (logo left; the template header or the institution's details right), gives headings, links and table headers the brand colour, and gives every table without its own layout the same look (thin row rules, striped rows, full width: the column with the longest text takes the rest of the line).
- The audit log records letters without their HTML or storage key (per-model `unlogged` fields in `AUDITED_MODELS`).

## Emails to students (Communications)

`services/communication.service.js`, module `communications` (create = send, read = the log, update = retry).

- **Every email to a student is logged** in `application_emails` as it was sent (recipient, cc / bcc, subject, HTML and text body, the letter whose PDF is attached). Sending = log the row (`sending`), then one try through `emailHelper.send` (the tenant's SMTP or Firmli's).
- **Retries**: a failed try sets `retrying` with `next_retry_at` (5, 10, 20 ... minutes, at most 6 h) until `max_attempts` = 1 + `emailMaxRetries`, then `failed`. A loop started with the background work (`automationService.startBackground`, in `bin/www` and `bin/worker.js`) sends due retries every minute; a row is **claimed** with a conditional UPDATE (`status` still `retrying`), so two API instances never send it twice. At startup, rows left in `sending` by a crash are retried. No mail server at all fails at once. A person can retry any failed email.
- The letter's PDF is read from S3 again on each try (not stored in the row).
- Request documents (Manual Review) goes through the same log, so it is retried too.
- All instances must share the same S3 and SMTP settings: whichever instance claims a retry sends it with its own config.
- **Ready for replies** (not built yet): each email gets its own `Message-ID` (`emailHelper.newMessageId()`, `<uuid@domain of MAIL_FROM>`) when it is logged, saved in `message_id` and sent on every try. A student's reply names it in its `In-Reply-To` / `References` headers, so a later reader of the institution's mailbox (IMAP, or Google / Outlook OAuth) finds the email, application and student it answers: `WHERE tenant_id = ? AND message_id IN (...)`. `reply_to` (the contact email at send time) and `from_email` say which mailbox the reply lands in (`reply_to`, else `from_email`).

## Automation (events)

`helpers/events.helper.js` is a small in-process event bus, so services say what happened without importing who reacts (no import cycles). `services/automation.service.js` listens:

| Event | Emitted by | Reaction (when on in Settings) |
|---|---|---|
| `application.decided` | the AI assessment (completed), a Manual Review decision, Change outcome | `autoLetterGeneration`: generate the letter |
| `letter.approved` | a person's approval, or Settings approving at generation | `autoEmailDispatch`: send the letter email |

Listeners run on the next tick, inside the same request context (who did it, for the audit log); a failure is logged as a warning and changes nothing (e.g. no template on the program), so a person can do it by hand.

## Live updates (SSE)

The browser keeps one `EventSource` open on `GET /v1/events` and is told when something changed, instead of reloading (frontend usage: [frontend-guide-04.md](frontend-guide-04.md)).

```
POST /v1/events/ticket  (normal login token)  -> a 60 s JWT with purpose "events"
GET  /v1/events?ticket=...                    -> sessionUser() checks user, tenant, token_version
                                              -> realtimeHelper.open: SSE headers, "ready", ": ping" every 25 s
service: realtimeHelper.publish(tenantId, "assessment.updated", {applicationId, assessmentId, status})
  -> Redis PUBLISH <QUEUE_PREFIX>:events  (no Redis: an in-process EventEmitter)
  -> every API process subscribed (only once a stream is open) -> deliver: same tenant + read on the event's module
```

- `helpers/realtime.helper.js`; `REALTIME_EVENTS` maps each event to the module a user needs **read** on: `assessment.updated` → applications, `review.updated` → reviews, `letter.updated` → letters, `email.updated` → communications.
- Publishers: `assessmentService` (start, save, fail; runs in the worker process, which is why it goes through Redis), `manualReviewService.announce`, `letterService.announce`, `communicationService` (each attempt), `applicationService` upload (a waiting case reopens).
- Events carry ids and statuses only; the page refetches with its own permissions. A failed publish is only logged.
- Why a ticket: `EventSource` cannot send headers, and a token in the URL lands in logs. The ticket only opens a stream (`verifyToken` refuses tokens with a `purpose`), and `requestLogger` masks `ticket=`.
- Shutdown (`bin/www`, `bin/worker.js`): `realtimeHelper.close()` ends open streams so the server can close; browsers reconnect with a new ticket. Missed events are not replayed; the page refetches after a reconnect.
- Behind nginx / a load balancer: `X-Accel-Buffering: no` is sent; the idle timeout must be over 25 s.

## AI usage (tokens and cost)

- Every AI call is logged in `ai_usage_logs`: tenant, application / document, operation, model, input / cached / output tokens, duration, success or failure, and the cost in USD.
- The AI code calls `aiUsageService.record({tenantId, applicationId, operation, modelId, inputTokens, cachedInputTokens, outputTokens, durationMs, status, ...})` after each request. Who started it is taken from the request context.
- Prices live on `ai_models` (USD per 1M tokens: input, cached input, output). The cost is calculated and **stored when the call is logged**, so price changes never rewrite history. A model without prices logs `cost_usd = NULL`.
- Each model belongs to an `ai_providers` row (`openai` = OpenAI (ChatGPT), `anthropic` = Anthropic (Claude)). `is_available` = the app can call it; only OpenAI is called today, so Claude models are listed with prices but Settings refuses them. To support Claude later: an Anthropic call in the AI code, then `is_available = 1`. Anthropic counts cache reads apart from `input_tokens`, so pass `inputTokens` as the total including them, like OpenAI.
- Prices (migration 034, official pricing pages on 2026-10-26, per 1M tokens): GPT-5.6 Luna 0.20 / 0.02 / 1.20, Terra 2.00 / 0.20 / 12.00, Sol 4.00 / 0.40 / 20.00; Claude Haiku 5.5 0.10 / 0.01 / 0.50, Sonnet 5.5 2.00 / 0.10 / 10.00, Opus 5.5 4.00 / 0.20 / 20.00. When a provider changes a price, update the row (new migration); only later calls use it.
- `GET /v1/ai-usage/summary` (totals, by day, by model, by operation) and `GET /v1/ai-usage` (the log) read it; module `ai_usage`, read only.
- Day-based reports (dashboard, AI usage) share `helpers/date.helper.js` (viewer's UTC offset, chart range, filling empty days) and `common.period` validation.

## Errors and responses

- Success: `{statusCode, data, message, success: true}`.
- Error: `{statusCode, data: null, message, success: false, code, errors}`. `errors` is `{field: message}` for a 422 and `[{message}]` otherwise.
- `code`: a stable name from `constants/error-codes.constants.js` (`TENANT_BLOCKED`, `ACCOUNT_NOT_ACTIVE`, `SESSION_ENDED`, `LOGIN_REQUIRED`, `EVENTS_TICKET_INVALID`) for errors the frontend acts on, `null` otherwise, so messages can be reworded freely. Set it with `ApiError.of(status, message, ERROR_CODES.X)` or the last argument of `responseHelper.errorResponse`.
- Responses shaped for the frontend so it never re-derives data: `GET /v1/roles` has `userCount` per role; `GET /v1/auth/me` has `modules` with their actions (`roleService.modules`); `GET /v1/emails/:id` swaps the inline logo for a link (`communicationService.viewableHtml`); audit log changes and Activity details name the users behind id fields (`USER_ID_FIELDS`, `auditLogService.withUserNames`, one query per page).
- Unexpected server errors never show their message outside development (`"Something Went Wrong!"`). An `ApiError` thrown on purpose keeps its message, e.g. 503 "Email is not configured".

## Logging

- **pino**: JSON in staging / production, pretty in development. Use `logger` (or `req.log` inside a request), never `console`.
- Every response has an `X-Request-Id` header, and every log line of that request carries the same id, so a bug report with the id finds the logs.
- The `Authorization` header, cookies and any `password` / `token` field are masked before a line is written.

## Configuration

All settings come from env files (`.env.development.local` locally) and are validated at boot by `src/v1/configs/env.config.js`. A wrong value stops the server with a clear message. The sections, in the same order as `.env.example`: App, Login tokens, Database, Frontend, File storage (S3), Job queue (Redis), Email (SMTP), AI (`OPENAI_BASE_URL`, empty = OpenAI itself), Encryption. The rest of the code reads `config`, never `process.env`.

## Scripts and running

| Command | What it does |
|---|---|
| `npm run staging` | Runs locally with nodemon and `.env.development.local` |
| `npm run production` | Runs with `.env` |
| `npm run create-tenant -- "Name" "Admin Name" admin@yopmail.com "Password" CODE` | New tenant with its settings and first Super Admin |
| `npm run platform-tenant -- <id or code>` | Marks Firmli's own tenant: its users may switch tenant / user |
| `npm run worker` | A queue worker only (no HTTP), with `.env.development.local`; `npm run production_worker` in the image |
| `npm test` | Automated tests (Node's built-in test runner + supertest), no database needed: the app's basics, login checks, helpers, letter / email rules, validation. Files in `test/`, settings in `test/setup.js` |
| `npm run test:db` | The API tests on a real database (`test/db/*.flow.js`): tenants, login and passwords, users and roles, setup (campuses, eligibility, programs, templates), applications through AI assessment, review, letter and email, settings. Each file makes its own database `firmli_test_<run>_<pid>` from `schema.sql` on the local MySQL and drops it at the end; files go to the local S3 mock under `test-db/` and are removed. A fake OpenAI (`OPENAI_BASE_URL`) and a fake SMTP server run inside the tests, Redis is not used. `-- applications` runs only matching files, `-- --keep` keeps the databases. Local only: it refuses a non-local `FIRMLI_DB_HOST` or `S3_ENDPOINT` |
| `npm run seed:locations` | Fills countries / states / cities (safe to run again) |

The Dockerfile (Node 24 LTS, `engines.node >= 24`) runs `npm run production_start` as a non-root user on port 5000.

**Behind a load balancer** set `TRUST_PROXY` to the number of proxies in front of the app (`1` behind one AWS ALB). It is a hop count, never `true`: `true` trusts every `X-Forwarded-For` entry, so anyone could fake their IP and get past the login / reset limits; `0` behind a proxy makes every user share the proxy's IP, so 10 wrong logins would lock everyone out. `true` is refused at boot.

## Adding a new module (checklist)

1. Migration `database/migrations/00N_xyz.sql` and the same change in `database/schema.sql` (`tenant_id`, `deleted_at`, `not_deleted` in unique keys).
2. A `modules` row and its role permissions, in the migration and in `schema.sql`; a `MODULES.XYZ` constant.
3. Model `src/v1/models/client/xyz.model.js` (`paranoid: true`); add it to `AUDITED_MODELS` to log its changes.
4. Validation `schemas/validations/xyz.validation.js`, service `services/xyz.service.js`, controller, route.
5. Mount it: `app.use("/v1/xyz", authenticate, authorize(MODULES.XYZ), xyzRouter)`.
6. Document the endpoints in the frontend guide.

## Not built yet

- PDFs and emails are not queued: a PDF takes well under a second, and failed emails have their own retry loop in the database.
