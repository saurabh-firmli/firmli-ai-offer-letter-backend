# Frontend Guide: Firmli AI Offer Letter API (part 01)

Parts: [01 — basics, login, users, roles, programs, campuses, locations](frontend-guide-01.md) · [02 — letter templates, email templates, eligibility, dashboard, applications](frontend-guide-02.md) · [03 — manual review queue, decisions, AI assessment, letters, communications, notes, extract, notifications, activity](frontend-guide-03.md) · [04 — live updates, branding, dropdowns](frontend-guide-04.md) · [05 — settings, reports, AI usage, audit logs, Firmli staff (switch user, platform panel)](frontend-guide-05.md). This is part 01.

How to call this backend from the frontend: base URL, request rules, the response format and how errors come back.

## Base URL

| Environment | Base URL |
|---|---|
| Local | `http://localhost:5000/v1` |

Every endpoint lives under `/v1`. The port comes from `PORT` in the backend's env file (default `5000`).

## Sending requests

- Send bodies as JSON with the header `Content-Type: application/json`.
- The maximum body size is **1 MB**.
- Every endpoint except `/v1/health`, `/v1/auth/login`, the forgot / reset password ones and the live updates stream (a ticket instead, [part 04](frontend-guide-04.md)) needs the login token: `Authorization: Bearer <token>` (see [Login](#login)).
- Use the API's enum values exactly as documented for each endpoint. They are lowercase snake_case, for example `"full_time"`, and the frontend maps them to labels such as "Full Time".

## Response format

Every response is JSON and always has `success`, so check that field first.

### Success

```json
{
  "statusCode": 200,
  "data": { },
  "message": "Success",
  "success": true
}
```

The payload is always in `data`.

### Error

```json
{
  "statusCode": 404,
  "data": null,
  "message": "Not Found",
  "success": false,
  "code": null,
  "errors": [
    { "message": "/v1/unknown endpoint is not found." }
  ]
}
```

`code` is a fixed name for errors the frontend must act on. **Decide with `code`, never by reading the message text**: messages may be reworded. `null` on every other error.

| `code` | Status | When | What to do |
|---|---|---|---|
| `LOGIN_REQUIRED` | `401` | No token sent | Go to login |
| `SESSION_ENDED` | `401` | Token invalid or expired, logged out, password changed, user deleted | Clear the token, go to login |
| `TENANT_BLOCKED` | `401` (any call with a token), `403` (login), `409` (switch user) | The institution was blocked by Firmli | Clear the token; on the login page show "Your institution's account is blocked" (or `message`) |
| `ACCOUNT_NOT_ACTIVE` | `401`, `403` (login), `409` (switch user) | The user is blocked, banned, deactivated or deleted | Clear the token; show `message` on the login page |
| `EVENTS_TICKET_INVALID` | `401` | The live updates ticket expired ([part 04](frontend-guide-04.md#why-a-ticket)) | Ask for a new ticket |

`errors` comes in two shapes:

| Case | Status | `errors` shape |
|---|---|---|
| Validation failed (form fields) | `422` | Object keyed by field name: `{ "name": "name is required", "code": "code is required" }` |
| Everything else | any 4xx / 5xx | Array of messages: `[{ "message": "..." }]`, or `[]` |

For a `422`, show each message under its form field. The keys match the field names you sent, and a nested field uses a dotted path such as `"address.city"`.

In local development an error response also includes a `stack` field. Don't show it to users. It is not sent in staging or production, and there a `500` always says `"Something Went Wrong!"` with `errors: []`.

## Deleting

Every `DELETE` is a soft delete: the record disappears from the app (lists, lookups and dropdowns, and its id then answers `404`), but it stays in the database. For the frontend this means:

- A deleted record's unique value is free again: after deleting program `MSDS`, a new program can use the code `MSDS`. The same goes for campus names, template and set names, and user emails.
- A deleted user can no longer log in, and their current token stops working.
- A record still used by another one can't be deleted (`409`, e.g. a campus used by a program). Once that other record is deleted or changed, the delete works.

## Status codes

| Code | Meaning | What the frontend should do |
|---|---|---|
| `200` | OK | Use `data` |
| `201` | Created | Use `data` (the created record) |
| `204` | No Content | No body, nothing to parse |
| `400` | Bad Request | Usually a malformed body (invalid JSON), so fix the request |
| `401` | Unauthorized | Token missing, invalid or expired: clear the stored token and send the user to login |
| `403` | Forbidden | The role may not do this (see Roles and permissions): show "not allowed" |
| `404` | Not Found | Show "not found" |
| `409` | Conflict | Duplicate value, e.g. a code that already exists; show `message` |
| `422` | Validation error | Show the field errors from `errors` |
| `429` | Too Many Requests | Wait and retry |
| `500` | Server error | Show a generic error and note the request id (below) |
| `502` / `503` | An outside service failed or is not set up (email, file storage) | Show `message`, e.g. "Email is not configured", and let the user try again later |

## Request id (for bug reports)

Every response carries an `X-Request-Id` header. When an API call fails, log it or show it in the error toast. Include it in bug reports: the backend logs are searchable by this id.

## CORS and cookies

- The login session lives in an **httpOnly cookie** (`firmli_refresh`, sent only to `/v1/auth/...`). The page cannot read it; the browser sends it by itself.
- So send **every** request with `credentials: "include"` (the helper below does), and the backend's `CORS_ORIGINS` must list the frontend's exact address, e.g. `http://localhost:3005`. With `CORS_ORIGINS=*` the browser sends no cookie and a session cannot be refreshed.
- Requests to the cookie routes from a site that is not in `CORS_ORIGINS` answer `403` `"Requests from this site are not allowed"`.

## Example API helper

```js
const API_BASE_URL = "http://localhost:5000/v1";
let accessToken = localStorage.getItem("token"); // or keep it only in memory (safer): see "How it works"
let refreshing = null; // one refresh at a time, shared by every request that got a 401

export function setToken(token) {
  accessToken = token;
  token ? localStorage.setItem("token", token) : localStorage.removeItem("token");
}

// A new access token from the refresh cookie, or null when the session is over
export function refreshToken() {
  refreshing ??= fetch(`${API_BASE_URL}/auth/refresh`, {method: "POST", credentials: "include"})
    .then(async (res) => (res.ok ? (await res.json()).data.token : null))
    .catch(() => null)
    .finally(() => setTimeout(() => (refreshing = null)));
  return refreshing;
}

export async function api(path, {method = "GET", body} = {}, isRetry = false) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include", // the session cookie
  });

  if (res.status === 204) return null;

  const json = await res.json();

  // A 401 on any call but login / refresh: the 15-minute access token ran out (SESSION_ENDED), so get a new one once
  // and send the request again; when that fails, or the institution / user is blocked, log out.
  // The login page can tell why from the code, e.g. /login?reason=TENANT_BLOCKED
  if (res.status === 401 && !["/auth/login", "/auth/refresh"].includes(path)) {
    if (!isRetry && json.code === "SESSION_ENDED") {
      const token = await refreshToken();
      if (token) {
        setToken(token);
        return api(path, {method, body}, true);
      }
    }
    setToken(null);
    window.location.href = json.code && json.code !== "SESSION_ENDED" ? `/login?reason=${json.code}` : "/login";
  }

  if (!json.success) {
    const error = new Error(json.message);
    error.status = res.status;
    error.errors = json.errors; // object of field errors on 422, array otherwise
    error.code = json.code; // e.g. "TENANT_BLOCKED" on the login form's 403; null for most errors
    error.requestId = res.headers.get("X-Request-Id");
    throw error;
  }
  return json.data;
}
```

Usage:

```js
try {
  const health = await api("/health");
} catch (error) {
  if (error.status === 422) {
    // error.errors = { fieldName: "message", ... }
  }
}
```

## Endpoints

### `GET /v1/health`

Checks that the API is up.

Response `data`:

```json
{
  "service": "firmli-ai-offer-letter-backend",
  "uptime": 12.34,
  "database": "up",
  "queue": "up"
}
```

`database` and `queue` (the Redis job queue for AI assessments) are `"up"`, `"down"` or `"not_configured"`. `uptime` is in seconds.

### Login

There is **no signup**. Each client company is a *tenant*. The Firmli team creates the tenant and its first user, a **Super Admin**. The Super Admin then adds the company's other users from the app (see [Users](#users)).

Every user belongs to one tenant and only ever sees that tenant's programs, campuses and users. The backend takes the tenant from the logged in user, so the frontend never sends a tenant id. What the user may do depends on their role (see [Roles and permissions](#roles-and-permissions)).

| Method | Path | What it does | Token needed | Success |
|---|---|---|---|---|
| `POST` | `/v1/auth/login` | Log in: an access token, and the session cookie | no | `200` |
| `POST` | `/v1/auth/refresh` | A new access token from the session cookie | no (the cookie) | `200` |
| `GET` | `/v1/auth/me` | The logged in user | yes | `200` |
| `PATCH` | `/v1/auth/me` | Change my own name (profile) | yes | `200` |
| `POST` | `/v1/auth/logout` | Log out of this device | no (token or cookie) | `200` |
| `POST` | `/v1/auth/logout-all` | Log out of every device | yes | `200` |
| `POST` | `/v1/auth/change-password` | Change my own password | yes | `200` |
| `POST` | `/v1/auth/forgot-password` | Email me a reset link | no | `200` |
| `POST` | `/v1/auth/reset-password/verify` | Check a reset link before showing the form | no | `200` |
| `POST` | `/v1/auth/reset-password` | Set a new password with the link | no | `200` |
| `POST` | `/v1/auth/switch-back` | Firmli staff: back to my own account after a switch user ([part 05](frontend-guide-05.md#firmli-staff-switch-tenant--user)) | yes | `200` |

How it works:

1. Login answers `{user, token}` and sets the **session cookie** (`firmli_refresh`, httpOnly, 30 days). Keep `token` (the **access token**) with `setToken(token)`: in memory is safest, `localStorage` also works.
2. Send it on every other request as `Authorization: Bearer <token>`, always with `credentials: "include"`. The helper above does both.
3. The access token lasts **15 minutes**. Then a request answers `401` `SESSION_ENDED`: call `POST /v1/auth/refresh` (no body, the cookie goes by itself), store the new `token` and send the request again. The helper does this, once per 401, one refresh at a time even when several requests fail together.
4. The session lasts **30 days from its last use**: every refresh starts them again, so an active user stays logged in. A refresh answers `401` (and clears the cookie) when the session ended: logout, password changed, too old, the user deleted, blocked (`ACCOUNT_NOT_ACTIVE`) or their institution blocked (`TENANT_BLOCKED`). Then send the user to login.
5. **On app load**: with a stored access token call `GET /v1/auth/me`; keeping it only in memory, call `refreshToken()` first (the cookie is still there) and then `/auth/me`. It gives the user's name, role, permissions and tenant.
6. Show menus and buttons from `user.permissions` (see [Roles and permissions](#roles-and-permissions)). An action the role may not do answers `403`.
7. Each refresh also replaces the cookie. If an older cookie is used again later (a copied one), the session is ended for safety and the user logs in again.

#### `POST /v1/auth/login`

Body: `{ "email": "...", "password": "..." }`. Email case does not matter.

```js
const {user, token} = await api("/auth/login", {
  method: "POST",
  body: {email: "admin@yopmail.com", password: "secret123"},
});
setToken(token); // the session cookie was set by the response
```

Response `data`:

```json
{
  "user": {
    "id": 1,
    "tenantId": 1,
    "name": "Saurabh",
    "email": "saurabh@yopmail.com",
    "roleId": 1,
    "role": "super_admin",
    "roleName": "Super Admin",
    "status": "active",
    "lastLoginAt": "2026-10-23T09:12:00.000Z",
    "createdAt": "2026-10-23T04:29:36.000Z",
    "updatedAt": "2026-10-23T04:29:36.000Z",
    "tenant": {"id": 1, "name": "Edde Global", "isPlatform": false, "status": "active"},
    "permissions": {
      "programs": {"create": true, "read": true, "update": true, "delete": true},
      "users": {"create": true, "read": true, "update": true, "delete": true}
    }
  },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

`role` is the role code (`super_admin`, `institution_admin`, `admissions_officer`, `reviewer` or `read_only`) and `roleName` its label. `permissions` has one entry per module the role may use. `tenant.name` is the company name, e.g. for the app header; `tenant.isPlatform` is `true` only for Firmli staff ([switch tenant / user](frontend-guide-05.md#firmli-staff-switch-tenant--user)).

#### `GET /v1/auth/me`

Response `data` is the `user` object above, plus `modules`: every module with the actions it has, the same list as in [`GET /v1/roles`](#get-v1roles), so the Profile's **Your access** can show "Audit Logs: read" or "Settings: read, update" without hard-coding which actions exist (and without Roles read):

```json
"modules": [{"code": "programs", "name": "Programs", "actions": ["create", "read", "update", "delete"]}, {"code": "audit_logs", "name": "Audit Logs", "actions": ["read"]}]
```

For each module, the user may do `permissions[module.code][action]` of `module.actions`.

#### My profile: `PATCH /v1/auth/me`

For the **Profile** page: show the user from `GET /v1/auth/me` (name, email, role, institution, last login) and let them change their **name**. Any logged in user; no permission is needed.

```js
const user = await api("/auth/me", {method: "PATCH", body: {name: "Riya Kapoor"}});
```

- `name`: required, max 150, trimmed. Answers the updated `user` (as `GET /v1/auth/me`); the token stays the same.
- Only the name: any other field answers `422` (e.g. `{ "email": "email is not allowed" }`). Email, role and status are changed by an admin under Users; the password with [Change password](#change-password).
- The change is in the audit log as the user's own change.

#### Logout

```js
await api("/auth/logout", {method: "POST"}).catch(() => {}); // already logged out is fine
setToken(null);
window.location.href = "/login";
```

- `POST /v1/auth/logout` logs out **this device**: its session and access tokens end and the cookie is cleared. Other devices stay logged in. It works with an expired access token too (the cookie tells which session) and always answers `200`.
- `POST /v1/auth/logout-all` (needs a valid token) logs out **every device**, e.g. a **Log out everywhere** button after a lost phone. Then clear the token as above.
- Response `data` is `null`. Stop the live updates stream before (part 04).

#### Change password

For a **Change password** screen (e.g. under the profile menu). Any logged in user may change their own password; no permission is needed.

```js
const {user, token} = await api("/auth/change-password", {
  method: "POST",
  body: {currentPassword: "OldPass123", newPassword: "NewPass456"},
});
setToken(token); // the old access token no longer works; the session cookie stays
```

- `newPassword`: 8 to 72 characters, different from the current one. Ask for it twice on the screen; the API takes it once.
- Answers like login: `{user, token}`. **Store the new token**: this device stays logged in (same session), every other device is logged out.
- The user gets an email "Your password was changed", so they notice a change they did not make.
- Wrong current password: `422` `{ "currentPassword": "The current password is incorrect" }`. Same as current: `422` `{ "newPassword": "The new password must be different from the current one" }`.

#### Forgot / reset password

1. **Forgot password?** link on the login page → a form with the email → `POST /v1/auth/forgot-password` `{ "email": "..." }`.
   It always answers `200` with `message` `"If an account exists for this email, a reset link is on its way"` (show that message), whether or not the email has an account, so nobody can find out who has one. Banned, blocked, deactivated and deleted users get no email.
2. The email has a **Reset password** button to `<FRONTEND_URL>/reset-password?token=...`. The link works **once**, for **60 minutes**. Asking again makes the older links stop working.
3. The frontend's `/reset-password` page reads `token` from the URL and first checks it:

```js
const token = new URLSearchParams(window.location.search).get("token");
try {
  const {email} = await api("/auth/reset-password/verify", {method: "POST", body: {token}});
  // show the form: "Choose a new password for riya@yopmail.com", new password + confirm
} catch (error) {
  // 400: "This reset link is invalid or has expired, please ask for a new one": show it with a link to Forgot password
}
```

4. On submit:

```js
const {user, token: loginToken} = await api("/auth/reset-password", {method: "POST", body: {token, password: newPassword}});
setToken(loginToken); // logged in (a new session cookie): go to the dashboard
```

- `password`: 8 to 72 characters.
- Answers like login (`{user, token}` and a new session cookie): the user is logged in, every older session and token stops working, and they get a "Your password was changed" email. An `inactive` user becomes `active`, as on a first login.
- The emails go through the institution's own email server when one is set up in Settings, otherwise through Firmli's, in the institution's name.

#### Auth errors

| Status | When | Body |
|---|---|---|
| `422` | Login fields invalid, e.g. not an email | `errors` = `{ field: message }` |
| `401` | Login with a wrong email or password | `errors[0].message`: `"Invalid email or password"`. Show it on the login form |
| `429` | 10 failed logins from the same network within 15 minutes | `errors[0].message`: `"Too many failed logins, try again in 15 minutes"`. Even the right password is refused until then |
| `401` | Request without a token | `errors[0].message`: `"Login required"` |
| `403` | Login with the right password, but the institution is blocked by Firmli | `errors[0].message`: `"Your institution's account is blocked; contact Firmli"` |
| `403` | Login with the right password, but the user is `banned`, `blocked`, `deactivated` or `deleted` | `errors[0].message`, e.g. `"Your account is blocked; contact your administrator"` (the status in the text). Show it on the login form |
| `401` | Access token expired (every 15 minutes) or invalid, its session ended (logout, password changed), or the user was deleted | `errors[0].message`: `"Session expired or invalid, please log in again"`, `code` `SESSION_ENDED`: refresh once, then log in |
| `401` | Refresh without a working session cookie, or with an old one used again | `code` `SESSION_ENDED` (or `ACCOUNT_NOT_ACTIVE` / `TENANT_BLOCKED`): log in again |
| `429` | 30 failed refreshes from the same network within 15 minutes | `errors[0].message`: `"Too many failed session refreshes, try again in 15 minutes"` |
| `403` | Refresh, logout or switch back from a site not in `CORS_ORIGINS` | `errors[0].message`: `"Requests from this site are not allowed"` |
| `422` | Change password: wrong current password, or a new password that is too short / the same | `errors` = `{ currentPassword: ... }` or `{ newPassword: ... }` |
| `429` | 10 wrong current passwords, or 10 invalid reset links, from the same network within 15 minutes | `errors[0].message`: `"Too many wrong passwords, try again in 15 minutes"` / `"Too many invalid reset links, ..."` |
| `429` | More than 5 forgot-password requests from the same network within 15 minutes | `errors[0].message`: `"Too many reset requests, try again in 15 minutes"` |
| `400` | Reset link unknown, used, expired or replaced by a newer one | `errors[0].message`: `"This reset link is invalid or has expired, please ask for a new one"` |
| `401` | The user's status changed from `active` while logged in | `errors[0].message`, e.g. `"Your account is inactive; contact your administrator"`. Log out and show the message on the login page |
| `403` | The role lacks the permission for this module and action | `errors[0].message`, e.g. `"You do not have permission to create programs"` |

### Users

The users of your own tenant. Needs the Users permission: by default the Super Admin can do everything here and the Institution Admin can only see the list.

| Method | Path | What it does | Success |
|---|---|---|---|
| `GET` | `/v1/users` | All users of the tenant, sorted by name. Optional `?status=` (one of the statuses below) and `?search=` (part of the name or email) | `200` |
| `POST` | `/v1/users` | Add a user | `201` |
| `PATCH` | `/v1/users/:id` | Change name, email, role (`roleId`), status (e.g. block / unblock), or reset the password | `200` |
| `DELETE` | `/v1/users/:id` | Remove a user; their token stops working at once | `200` |
| `POST` | `/v1/users/:id/send-credentials` | Email the user their login details (**Send by Email**) | `200` |

#### User fields

| Field | Type | Required on create | Notes |
|---|---|---|---|
| `name` | string, max 150 | yes | |
| `email` | string | yes | Must be unique across the whole app; stored in lowercase |
| `password` | string, 8 to 72 characters | yes | On `PATCH`, send it only to reset the password; the user is then logged out on all devices. It is never returned |
| `roleId` | integer | yes | `id` of a role from [`GET /v1/roles`](#get-v1roles) |
| `status` | enum | no | `inactive` (default), `active`, `banned`, `blocked`, `deactivated`, `deleted` |

A user, as returned by the API:

```json
{
  "id": 2,
  "tenantId": 1,
  "name": "Riya",
  "email": "riya@yopmail.com",
  "roleId": 2,
  "role": "admissions_officer",
  "roleName": "Admissions Officer",
  "status": "inactive",
  "lastLoginAt": null,
  "createdAt": "2026-10-23T04:53:08.000Z",
  "updatedAt": "2026-10-23T04:53:08.000Z"
}
```

```js
await api("/users", {
  method: "POST",
  body: {name: "Riya", email: "riya@yopmail.com", password: "TempPass123", roleId: 2},
});
```

**Status:**

| `status` | Label | Can log in |
|---|---|---|
| `active` | Active | yes |
| `inactive` | Inactive | yes; the login makes them `active` |
| `banned` | Banned | no |
| `blocked` | Blocked | no |
| `deactivated` | Deactivated | no |
| `deleted` | Deleted | no |

- **A new user starts as `inactive`** (it means "has not logged in yet"). Their first successful login makes them `active`; the audit log shows it as the user's own change `status inactive → active`.
- `banned`, `blocked`, `deactivated` and `deleted` users cannot log in: login answers `403` with a message naming the status, e.g. `"Your account is banned; contact your administrator"`. The API treats these four the same; they differ only in the label your team picks.
- Only an `active` user's token works. Changing a logged in user to any other status logs them out on their next request (`401`). Setting `inactive` only makes them log in again; to keep someone out, use one of the four statuses above. Set `{"status": "active"}` to give access back.
- Status `deleted` keeps the user in the list (filter `?status=deleted`). `DELETE /v1/users/:id` removes the user from the list for good.
- Nobody can change their own status. Only a Super Admin can change a Super Admin's status.
- `lastLoginAt` is the last successful login, `null` if the user never logged in. Show it as "Last login" ("Never" for `null`). A login does not change `updatedAt` and is not in the audit log; status changes are.

```js
await api(`/users/${id}`, {method: "PATCH", body: {status: "blocked"}});
```

#### Send login details by email

The **User Created** dialog shows the password once. Its **Send by Email** button emails the user their login page, email and password:

```js
const {sentTo} = await api(`/users/${user.id}/send-credentials`, {method: "POST", body: {password}});
// toast: `Login details sent to ${sentTo}`
```

- Send the same `password` the dialog shows. The backend stores passwords only hashed, so it checks that this is the user's current password before emailing it. Any other text answers `422` `{ "password": "This is not the user's current password" }`.
- The email has the user's name, email, password and a **Log in** button to `<FRONTEND_URL>/login?email=...`. It is sent through your institution's own email server when one is set up in Settings, otherwise through Firmli's in your institution's name, with your contact email (Settings) as reply-to.
- Needs the Users create permission. A `banned`, `blocked`, `deactivated` or `deleted` user answers `409` with their status, e.g. `"This user is blocked and cannot log in"`.
- `503` `"Email is not configured"` when the backend has no mail server; `502` `"The email could not be sent, please try again"` when the mail server refuses.
- The **Login Page** link in the dialog is `${FRONTEND_URL}/login?email=${encodeURIComponent(email)}`, the same as in the email.

Users change their own password with [Change password](#change-password), or with [Forgot password](#forgot--reset-password) when they forgot it. A user with the Users permission can also set the password of a user they may manage (see [Roles and permissions](#roles-and-permissions)) with `PATCH /v1/users/:id`; that user is then logged out everywhere (for your own password use Change password, which keeps you logged in). Nobody can change their own role.

#### User errors

| Status | When | Body |
|---|---|---|
| `422` | A field is invalid, or the id is not a number | `errors` = `{ field: message }` |
| `409` | The email already belongs to a user (in any tenant) | `message`: `"Email is already registered"` |
| `422` | `roleId` missing or not a role | `errors` = `{ "roleId": "Role not found" }` |
| `403` | The role lacks the Users permission | `errors[0].message`, e.g. `"You do not have permission to read users"` |
| `403` | Someone other than a Super Admin adds, changes or deletes a Super Admin | `message`: `"Only a Super Admin can add, change or delete a Super Admin"` |
| `403` | Not a Super Admin: giving a user a role that may do more than you, or changing / deleting such a user | `message`: `"You can only add, change or delete users whose role has no more access than yours"` |
| `403` | A user deletes themselves, or changes their own status or role | `message`: `"You cannot delete yourself"` / `"You cannot change your own status"` / `"You cannot change your own role"` |
| `404` | No user with that id in this tenant | `message`: `"User not found"` |

### Roles and permissions

What a user may do depends on their **role**. The roles are the same for every tenant. Each role starts with **default permissions**, and a tenant's **Super Admin** can change them for that tenant only (see [Roles & Permissions tab](#roles--permissions-tab)).

- **Roles:** Super Admin, Institution Admin, Admissions Officer, Reviewer, Read Only.
- **Modules:** Applications, Manual Review, Letters, Communications, Programs, Campuses, Letter Templates, Email Templates, Eligibility, Users, Roles & Permissions, Settings, AI Usage, Audit Logs.
- For each role and module there are up to four switches: **create**, **read**, **update**, **delete**. A module the role cannot use at all is missing from its permissions.

Defaults:

| Module | Super Admin | Institution Admin | Admissions Officer | Reviewer | Read Only |
|---|---|---|---|---|---|
| Applications | CRUD | CRUD | CRUD | read | read |
| Manual Review | read, update | read, update | read, update | read, update | read |
| Letters (generate, approve) | create, read, update | create, read, update | create, read | read | read |
| Communications (emails to students) | create, read, update | create, read, update | create, read, update | read | read |
| Programs, Letter Templates, Email Templates | CRUD | CRUD | create, read, update | read | read |
| Campuses, Eligibility | CRUD | CRUD | read | read | read |
| Users | CRUD | read | none | none | none |
| Roles & Permissions | read, update | read | none | none | none |
| Settings | read, update | read | none | none | none |
| AI Usage | read | read | none | none | none |
| Audit Logs | read (everyone's) | read (own) | read (own) | read (own) | read (own) |

- The **Super Admin's** permissions can never be changed, so a tenant cannot lock itself out.
- Only a Super Admin can add, change or delete a Super Admin user, even if another role is given the Users permission.
- Anyone else with the Users permission only adds, changes (password too) or deletes users whose role may do **no more than they may**: an Admissions Officer given Users can add another Admissions Officer, not an Institution Admin. Offer only those roles in the role select, or show the `403` message.
- Reviewer and Read Only differ only in Manual Review: a Reviewer can also work on (decide) cases.

**How the API checks it:** every request to a module needs the matching permission. `GET` needs read, `POST` create, `PATCH` / `PUT` update and `DELETE` delete. Without it the API answers `403`, e.g. `"You do not have permission to create programs"`. Some `POST` actions also count as create, e.g. **Publish Version** in Eligibility. In a module without create (Manual Review, Roles & Permissions, Settings) a `POST` needs update; Letters approve / reject need Letters update. Locations, dropdowns and notifications need only a login.

**What the frontend should do:** the logged in user carries their permissions (from login and `GET /v1/auth/me`). Use them to hide menus and buttons:

```js
const can = (user, module, action) => Boolean(user.permissions[module]?.[action]);

can(user, "programs", "read");    // show the Programs menu
can(user, "programs", "create");  // show "New Program"
can(user, "programs", "delete");  // show the delete icon
can(user, "roles", "read");       // show the Roles & Permissions tab
```

Hiding is only for a cleaner screen; the API still refuses the action. A change of role or of a role's permissions takes effect on the user's very next request, without logging in again. After saving permissions, call `GET /v1/auth/me` again if the change could affect the logged in user.

#### `GET /v1/roles`

Needs Roles & Permissions read. Every role with its permissions **in your tenant**, plus the modules. Use it for the Roles & Permissions tab and for the Role dropdown on the user form.

```json
{
  "modules": [
    {"code": "programs", "name": "Programs", "actions": ["create", "read", "update", "delete"]},
    {"code": "audit_logs", "name": "Audit Logs", "actions": ["read"]}
  ],
  "roles": [
    {
      "id": 1, "code": "super_admin", "name": "Super Admin", "description": "Everything, including users",
      "editable": false, "customized": false, "userCount": 1,
      "permissions": {"programs": {"create": true, "read": true, "update": true, "delete": true}}
    },
    {
      "id": 3, "code": "admissions_officer", "name": "Admissions Officer", "description": "...",
      "editable": true, "customized": true, "userCount": 4,
      "permissions": {"programs": {"create": true, "read": true, "update": true, "delete": false}}
    }
  ]
}
```

- `modules[].actions`: the switches that module has. Manual Review, Roles & Permissions and Settings have only read and update; Letters and Communications create, read and update; AI Usage and Audit Logs only read. Show the others as disabled.
- `editable`: `false` for the Super Admin. Show that column without switches.
- `customized`: `true` when your tenant changed this role's defaults. Show a "Custom" badge.
- `userCount`: how many users of your tenant have this role (any status, deleted users not counted). No need to load the users list for it.

#### `PUT /v1/roles/:id/permissions`

Needs Roles & Permissions update (Super Admin by default). Send the modules to change, each with all four switches. Modules you don't send stay as they are.

```js
await api(`/roles/${roleId}/permissions`, {
  method: "PUT",
  body: {
    permissions: {
      programs: {create: true, read: true, update: true, delete: false},
      audit_logs: {create: false, read: false, update: false, delete: false},
    },
  },
});
```

The response `data` is that role, in the same shape as in `GET /v1/roles`. Each save is written to the [audit log](frontend-guide-05.md#audit-logs) as one entry.

| Status | When | Body |
|---|---|---|
| `422` | A module missing an action, or no module sent | `errors` = `{ field: message }` |
| `422` | Unknown module | `errors` = `{ "permissions.bogus": "Module not found" }` |
| `422` | An action the module does not have | `{ "permissions.audit_logs": "Audit Logs has no create, update, delete" }` |
| `422` | Create, update or delete without read | `{ "permissions.campuses": "Turn on read to allow create, update or delete" }` |
| `403` | Changing the Super Admin role | `message`: `"Super Admin permissions cannot be changed"` |
| `403` | Not a Super Admin, changing (or resetting) your own role | `message`: `"You cannot change the permissions of your own role"` |
| `403` | Not a Super Admin, turning on what you may not do yourself | `message`: `"You can only give permissions you have yourself: users.create, settings.update"` |
| `403` | No Roles & Permissions update permission | `errors[0].message`: `"You do not have permission to update roles"` |
| `404` | No role with that id | `message`: `"Role not found"` |

#### `POST /v1/roles/:id/permissions/reset`

The **Reset to defaults** button of a role: removes your institution's changes, so the role has the default permissions again. Needs Roles & Permissions update. No body.

```js
const role = await api(`/roles/${roleId}/permissions/reset`, {method: "POST"});
// role.customized === false
```

- The response `data` is that role, as in `GET /v1/roles`, with `customized` `false`.
- Show the button only when `role.customized` is `true`, and ask "Reset Reviewer to the default permissions?" first.
- Logged in the audit log as one entry with every switch that changed. Resetting a role that was not customized changes and logs nothing.
- Same errors as above: `403` for the Super Admin role or without the permission, `404` for an unknown role.

#### Roles & Permissions tab

Show roles on a **page of their own**: a separate "Roles & Permissions" tab next to Users, not a section inside the Users page.

- **Who sees the tab:** `can(user, "roles", "read")`. By default that is Super Admin and Institution Admin.
- **Who can edit:** `can(user, "roles", "update")`. By default only the Super Admin. Everyone else sees the grid read only.
- **Data:** one call to `GET /v1/roles`. Columns are `roles` and rows are `modules`, both already in display order.
- **Editing:** for an editable role, show four switches per module, only for the actions in `module.actions`. Save the role with `PUT /v1/roles/:id/permissions`, then show the returned role. Turning off read should turn off create, update and delete too; otherwise the API answers `422`. A customized role (`customized: true`) gets a **Reset to defaults** button.
- **Footnote:** for Audit Logs, the Super Admin sees everyone's logs and the other roles see only their own.

Read-only cell text from a role's `permissions[module.code]`:

```js
const ACTIONS = ["create", "read", "update", "delete"];
const cellText = (permission) => {
  if (!permission) return "—";                                  // module not allowed
  const allowed = ACTIONS.filter((action) => permission[action]);
  if (allowed.length === ACTIONS.length) return "Full access";
  if (allowed.length === 1 && allowed[0] === "read") return "View only";
  return allowed.map((action) => action[0].toUpperCase() + action.slice(1)).join(", "); // "Create, Read, Update"
};
```

### Programs

| Method | Path | What it does | Success |
|---|---|---|---|
| `GET` | `/v1/programs` | List programs (paginated) | `200` |
| `POST` | `/v1/programs` | Create a program | `201` |
| `GET` | `/v1/programs/:id` | Get one program | `200` |
| `PATCH` | `/v1/programs/:id` | Update some or all fields | `200` |
| `DELETE` | `/v1/programs/:id` | Delete a program (soft delete) | `200` |

#### Program fields

| Field | Type | Required on create | Notes |
|---|---|---|---|
| `name` | string, max 150 | yes | Program Name |
| `code` | string, max 50 | yes | Program Code, must be unique within your tenant |
| `awardLevel` | string, max 100 | no | e.g. `"Masters"` |
| `campusId` | integer | **yes** | `id` of a campus from `GET /v1/campuses` (see [Campuses](#campuses)). Can be changed on `PATCH` but not cleared (`null` / `""` answer `422`) |
| `eligibilitySetId` | integer | no | The [eligibility set](frontend-guide-02.md#eligibility-criteria) this program uses; `null` = none. Many programs can share one set |
| `duration` | string, max 50 | **yes** | Free text, e.g. `"2 years"`. Can be changed on `PATCH` but not cleared (`""`, spaces or `null` answer `422`) |
| `studyMode` | enum | no | `full_time` (default), `part_time`, `online`, `hybrid` |
| `applicationDeadline` | string `YYYY-MM-DD` | no | The value of `<input type="date">` can be sent as is |
| `status` | enum | no | `draft` (default), `active`, `inactive`, `archived` |
| `description` | string, max 5000 | no | |
| `conditionalOfferTemplateId` | integer | no | A `conditional_offer` [letter template](frontend-guide-02.md#letter-templates) of your tenant; `null` = None |
| `rejectionTemplateId` | integer | no | A `rejection` letter template; `null` = None |
| `manualReviewTemplateId` | integer | no | A `manual_review` letter template; `null` = None |
| `offerEmailTemplateId` | integer | no | A `conditional_offer` [email template](frontend-guide-02.md#email-templates) of your tenant; `null` = None |
| `rejectionEmailTemplateId` | integer | no | A `rejection` email template; `null` = None |

Dropdown labels for the enums:

| `studyMode` | Label | | `status` | Label |
|---|---|---|---|---|
| `full_time` | Full Time | | `draft` | Draft |
| `part_time` | Part Time | | `active` | Active |
| `online` | Online | | `inactive` | Inactive |
| `hybrid` | Hybrid | | `archived` | Archived |

- For optional fields, an empty string `""` or `null` both mean "not set", so an empty form field can be sent as is. The API always returns unset fields as `null`.
- Extra fields such as `id`, `createdAt` and `updatedAt` are ignored, so you can send a whole program object back when editing.
- Fill each letter template dropdown with `GET /v1/letter-templates?letterType=...` for its type (see [Letter templates](frontend-guide-02.md#letter-templates)). Fill the two email dropdowns with `GET /v1/email-templates?emailType=conditional_offer` and `?emailType=rejection` (see [Email templates](frontend-guide-02.md#email-templates)).

#### A program, as returned by the API

```json
{
  "id": 1,
  "tenantId": 1,
  "name": "MSc Data Science",
  "code": "MSDS",
  "awardLevel": "Masters",
  "campusId": 1,
  "duration": "2 years",
  "studyMode": "full_time",
  "applicationDeadline": "2026-12-31",
  "status": "draft",
  "description": null,
  "conditionalOfferTemplateId": null,
  "rejectionTemplateId": null,
  "manualReviewTemplateId": null,
  "offerEmailTemplateId": null,
  "rejectionEmailTemplateId": null,
  "createdAt": "2026-10-22T08:26:33.000Z",
  "updatedAt": "2026-10-22T08:26:33.000Z",
  "eligibilitySetId": 3,
  "campus": {"id": 1, "name": "Main Campus", "city": "Ludhiana", "state": "Punjab", "country": "India"},
  "eligibilitySet": {"id": 3, "name": "UK Masters Standard", "publishedVersion": 1}
}
```

`campus` and `duration` are `null` only for programs created before they became required; ask for them when such a program is edited. Use `campus.name` to show the campus in tables, and `campusId` to preselect the dropdown on the edit form. `eligibilitySet.publishedVersion` is the number of the set's published criteria version, `null` if none is published yet.

#### `GET /v1/programs`

Query parameters, all optional:

| Param | Default | Notes |
|---|---|---|
| `page` | `1` | |
| `limit` | `20` | Max `100` |
| `status` | | Filter by status |
| `studyMode` | | Filter by study mode |
| `campusId` | | Filter by campus |
| `eligibilitySetId` | | Programs using that eligibility set |
| `search` | | Matches part of the name or code |

Newest programs come first. Response `data`:

```json
{
  "items": [ /* programs */ ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

`total` counts all matching programs, so the number of pages is `Math.ceil(total / limit)`.

#### `POST /v1/programs`

Send the form fields. `name`, `code`, `campusId` and `duration` are required. The response `data` is the created program, with defaults filled in.

```js
await api("/programs", {
  method: "POST",
  body: {name: "MSc Data Science", code: "MSDS", campusId: 1, duration: "2 years", studyMode: "full_time", status: "draft"},
});
```

#### `GET /v1/programs/:id`

Response `data` is the program.

#### `PATCH /v1/programs/:id`

Send only the fields that change, or the whole form. The response `data` is the updated program. An empty body gets a `422` with `errors.body`.

```js
await api(`/programs/${id}`, {method: "PATCH", body: {status: "active"}});
```

#### `DELETE /v1/programs/:id`

Deletes the program (soft delete, see [Deleting](#deleting)); its code can be used again; `data` is `null`. To hide a program but keep it, use `PATCH` with `{"status": "archived"}` instead.

#### Program errors

| Status | When | Body |
|---|---|---|
| `422` | A field is invalid, or the id is not a number | `errors` = `{ field: message }`, e.g. `{ "code": "code is required" }` |
| `422` | `campusId` missing, `null` or `""` | `errors` = `{ "campusId": "Select a campus" }` |
| `422` | `duration` missing or empty | `errors` = `{ "duration": "Duration is required" }` |
| `422` | `campusId` points to a campus that does not exist | `errors` = `{ "campusId": "Campus not found" }` |
| `422` | `eligibilitySetId` is not a set of your tenant | `errors` = `{ "eligibilitySetId": "Eligibility set not found" }` |
| `422` | A letter or email template id is not a template of that type in your tenant | e.g. `errors` = `{ "rejectionTemplateId": "Pick a Rejection template" }`, `{ "offerEmailTemplateId": "Pick a Conditional Offer template" }` |
| `409` | `code` already belongs to another program (on create or update) | `message`: `"Program code already exists"`. Show it under the Program Code field |
| `404` | No program with that id | `message`: `"Program not found"` |

### Campuses

Campuses are created once and then picked from the Campus dropdown on the program form.

| Method | Path | What it does | Success |
|---|---|---|---|
| `GET` | `/v1/campuses` | All campuses, sorted by name (for the dropdown) | `200` |
| `POST` | `/v1/campuses` | Create a campus | `201` |
| `GET` | `/v1/campuses/:id` | Get one campus | `200` |
| `PATCH` | `/v1/campuses/:id` | Update some or all fields | `200` |
| `DELETE` | `/v1/campuses/:id` | Delete a campus | `200` |

#### Campus fields

| Field | Type | Required on create | Notes |
|---|---|---|---|
| `name` | string, max 150 | yes | Unique within your tenant **per city** (case-insensitive): "Main Campus" can exist in Ludhiana and in Amritsar. Other tenants can use the same name |
| `cityId` | integer | yes | From [`GET /v1/locations/cities`](#locations-country--state--city). State and country come from the city, so they are not sent |

On the form, use three cascading dropdowns: Country, then State (filtered by country), then City (filtered by state). Send only `cityId`.

A campus, as returned by the API:

```json
{
  "id": 1,
  "tenantId": 1,
  "name": "Main Campus",
  "cityId": 60558,
  "stateId": 2001,
  "countryId": 101,
  "city": "Ludhiana",
  "state": "Punjab",
  "country": "India",
  "createdAt": "2026-10-22T13:15:10.000Z",
  "updatedAt": "2026-10-22T13:15:10.000Z"
}
```

- Use `countryId`, `stateId` and `cityId` to preselect the three dropdowns on the edit form, and `city`, `state` and `country` to show the place.
- A campus created before cities existed has all six location fields `null` until someone edits it and picks a city.

#### `GET /v1/campuses`

Returns every campus as an array in `data`, sorted by name, with no pagination. Optional `?search=` matches part of the name, city, state or country.

Campus dropdown options. Two campuses may share a name, so put the place in the label:

```js
const campuses = await api("/campuses");
const options = campuses.map((campus) => ({
  value: campus.id,
  label: campus.city ? `${campus.name} — ${campus.city}, ${campus.state}, ${campus.country}` : campus.name,
}));
```

#### Campus errors

| Status | When | Body |
|---|---|---|
| `422` | A field is invalid, or the id is not a number | `errors` = `{ field: message }` |
| `422` | `cityId` is not a known city | `errors` = `{ "cityId": "City not found" }` |
| `409` | The same name already exists in that city (in your tenant) | `message`: `"A campus with this name already exists in this city"` |
| `409` | Deleting a campus that programs still use | `message`: `"Campus is used by programs; move them to another campus first"` |
| `404` | No campus with that id | `message`: `"Campus not found"` |

### Locations: country → state → city

Shared lists for every tenant, for the Country → State → City dropdowns (e.g. on the campus form). Any logged in user can read them. They don't change while the app runs, so cache them.

| Method | Path | Returns |
|---|---|---|
| `GET` | `/v1/locations/countries` | All 250 countries: `[{id, name, iso2, phoneCode, currencyCode}]` |
| `GET` | `/v1/locations/states?countryId=101` | States of that country: `[{id, name, code}]` |
| `GET` | `/v1/locations/cities?stateId=2001` | Cities of that state: `[{id, name}]` |

- All three are sorted by name and take an optional `?search=` that matches part of the name.
- `countryId` and `stateId` are required. Without them the API answers `422`.
- Load states only after a country is picked, and cities only after a state. When the country changes, clear the state and city; when the state changes, clear the city.
- Some states have a few thousand cities (England has 2,919). Use a searchable dropdown that renders only the first matches.

```js
const countries = await api("/locations/countries");
const states = await api(`/locations/states?countryId=${countryId}`);
const cities = await api(`/locations/cities?stateId=${stateId}`);
```

In a program, `campus` carries the place names too: `{"id": 1, "name": "Main Campus", "city": "Ludhiana", "state": "Punjab", "country": "India"}`. All three are `null` for a campus without a city.
