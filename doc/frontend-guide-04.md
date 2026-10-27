# Frontend Guide: Firmli AI Offer Letter API (part 04)

Parts: [01 — basics, login, users, roles, programs, campuses, locations](frontend-guide-01.md) · [02 — letter templates, email templates, eligibility, dashboard, applications](frontend-guide-02.md) · [03 — manual review queue, decisions, AI assessment, letters, communications, notes, extract, notifications, activity](frontend-guide-03.md) · [04 — live updates, branding, dropdowns](frontend-guide-04.md) · [05 — settings, reports, AI usage, audit logs, Firmli staff (switch user, platform panel)](frontend-guide-05.md). This is part 04.

Base URL, the token, the response format, errors, status codes and the `api()` helper used below are in [part 01](frontend-guide-01.md).

## Endpoints (continued)

### Live updates (Server-Sent Events)

An AI assessment runs in the background and can take a minute or more. Instead of asking the user to reload, the page keeps one open connection and the server tells it when something changed. This uses the browser's built-in `EventSource`: no library, no WebSocket.

Events carry **ids and statuses only**. When one arrives, fetch the details with the normal endpoints, as you already do after an action. That way the page never shows data the user may not see.

| Method | Path | What it does | Permission |
|---|---|---|---|
| `POST` | `/v1/events/ticket` | A short ticket for opening the stream | any logged in user |
| `GET` | `/v1/events?ticket=...` | The stream itself; stays open | the ticket |

#### Why a ticket

`EventSource` cannot send an `Authorization` header, so the login token would have to go in the URL, where it ends up in browser history and server logs. Instead, ask for a ticket with the normal token and put the ticket in the URL:

```js
const {ticket, expiresIn} = await api("/events/ticket", {method: "POST"});
// ticket: a string, valid for expiresIn = 60 seconds, only for opening the stream
```

- A ticket only opens the stream. It is refused as a login token everywhere else, and the login token is refused as a ticket.
- Use it within 60 seconds. The stream stays open after that; the time limit is only for opening it.
- Ask for a **new ticket every time** you open or reopen the stream.
- Logout, a password change or a blocked user or tenant also stop new streams for that user.

#### Events

Each message has a name (`event:`) and a JSON body (`data:`). A user only receives events of their own institution, and only for modules their role may **read**.

| Event | When | Body | Needs read on |
|---|---|---|---|
| `ready` | Right after the stream opens | `{userId}` | — |
| `assessment.updated` | An assessment starts, finishes or fails | `{applicationId, assessmentId, status, outcome?}`; `status`: `in_progress`, `completed` (with `outcome`) or `failed` | Applications |
| `review.updated` | A review case opens, is assigned, waits for documents (or a document arrives), goes back to the AI, or is decided | `{applicationId, reviewId?, status}`; `status`: `unassigned`, `assigned`, `in_review`, `waiting_documents`, `resolved` | Manual Review |
| `letter.updated` | A letter is generated, approved or rejected | `{applicationId, letterId, status}`; `status`: `pending_approval`, `approved`, `rejected` | Letters |
| `email.updated` | A try of any email to a student (letter or document request, a retry too) ended: sent, will be retried, or failed | `{applicationId, emailId, status}`; `status`: `sent`, `retrying`, `failed` | Communications |

Example of what arrives:

```
event: assessment.updated
data: {"applicationId":85,"assessmentId":41,"status":"completed","outcome":"conditional_offer"}
```

The server also sends a comment line (`: ping`) every 25 seconds so proxies keep the connection open. `EventSource` ignores it.

#### What to refresh on each event

| Event | Refresh |
|---|---|
| `assessment.updated` | The application details page if it shows that `applicationId` (status, assessment result, Activity tab); the applications list; the dashboard |
| `review.updated` | The Manual Review queue; the case page if it shows that application |
| `letter.updated` | The Letters tab of that application; the letters waiting for approval list |
| `email.updated` | The Communications list; the Letters tab of that application (email status) |
| any of them | The topbar bell (`GET /v1/notifications`), **debounced** (below) |

**Always debounce the refetch.** Every open tab of every user of the institution gets every event, and events come in bursts (one assessment sends two or three; a batch of submissions sends dozens). A refetch per event would make every tab call the API at the same moment. So:

- Wait until no event came for **1 second**, plus a random 0 to 1 second (so the tabs of 50 users do not all call at once), then refetch **once**.
- Refetch only what the page shows (the bell is always shown; a list only when it is open).
- A hidden tab (`document.visibilityState === "hidden"`) does not refetch; it refetches once when it becomes visible again.

The `refetchSoon` helper below does all three.

The user who clicked a button also gets the event of their own action. Refetching twice is harmless; skip it if you like.

#### Example: one stream for the whole app

Open it once after login, in the app layout, not per page. Pages subscribe to the events they care about.

```js
// live.js
const listeners = new Map(); // event name -> Set of callbacks
const EVENTS = ["assessment.updated", "review.updated", "letter.updated", "email.updated"];
let source = null;
let retryTimer = null;

async function connect() {
  clearTimeout(retryTimer);
  try {
    const {ticket} = await api("/events/ticket", {method: "POST"});
    source = new EventSource(`${API_BASE_URL}/events?ticket=${encodeURIComponent(ticket)}`);
  } catch (error) {
    // Logged out (api() already redirects on 401) or the server is down: try again later
    retryTimer = setTimeout(connect, 10_000);
    return;
  }
  for (const name of EVENTS) {
    source.addEventListener(name, (event) => {
      const data = JSON.parse(event.data);
      listeners.get(name)?.forEach((callback) => callback(data));
    });
  }
  // The ticket inside the URL is used up: on any drop, close and reconnect with a new ticket
  source.onerror = () => {
    source.close();
    retryTimer = setTimeout(connect, 5_000);
  };
}

export const live = {
  start: () => { if (!source) connect(); },
  stop: () => { clearTimeout(retryTimer); source?.close(); source = null; },
  on: (name, callback) => {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(callback);
    return () => listeners.get(name).delete(callback); // call this to unsubscribe
  },
};
```

- Call `live.start()` after login (and on page load when a token is stored).
- Call `live.stop()` on logout, **before** removing the token.
- Do not rely on `EventSource`'s own reconnect: it would reuse the old ticket, which has expired. The `onerror` above closes it and opens a new one.

React example for the application details page:

```js
useEffect(() => live.on("assessment.updated", (data) => {
  if (data.applicationId === applicationId) refetchApplication();
}), [applicationId]);
```

The debounce helper (one per thing to refetch):

```js
// refetch = refetchSoon(fn); call refetch() for every event: fn runs once, 1 to 2 s after the last call,
// only while the tab is visible. Call refetch.dispose() when the component goes away
export function refetchSoon(fn) {
  let timer = null;
  let missed = false;
  const run = () => {
    if (document.visibilityState === "hidden") { missed = true; return; }
    fn();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible" && missed) { missed = false; fn(); }
  };
  document.addEventListener("visibilitychange", onVisible);
  const refetch = () => {
    clearTimeout(timer);
    timer = setTimeout(run, 1000 + Math.random() * 1000);
  };
  refetch.dispose = () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
  return refetch;
}
```

The bell, in the layout:

```js
useEffect(() => {
  const refetch = refetchSoon(refetchNotifications);
  const offs = ["assessment.updated", "review.updated", "letter.updated", "email.updated"].map((name) => live.on(name, refetch));
  return () => { offs.forEach((off) => off()); refetch.dispose(); };
}, []);
```

Lists the same way, e.g. the applications list:

```js
useEffect(() => {
  const refetch = refetchSoon(refetchList);
  const off = live.on("assessment.updated", refetch);
  return () => { off(); refetch.dispose(); };
}, []);
```

#### Things to know

- **After a reconnect, refetch the open page once.** Events sent while the connection was down are not replayed.
- **Keep a 60 second poll of `GET /v1/notifications`** as a safety net (events missed while the stream was down), with the same `refetchSoon` so a poll and an event do not both call.
- The "Run assessment" button still answers at once with `in_progress`. Show a spinner and wait for `assessment.updated` with `completed` or `failed`; no need to reload.
- Errors when opening the stream come back as normal JSON with status `401` (`"Events ticket expired or invalid; ask for a new one"`), but `EventSource` cannot read them: it only calls `onerror`. The example above handles that by asking for a new ticket.
- Browsers allow about 6 connections per server over HTTP/1.1. One stream per tab is fine; do not open one per component.
- In development the API runs at `http://localhost:5000`; the stream works across origins with the same CORS settings as the other endpoints.

### Branding: logo and colour

Every letter PDF is printed on the institution's **letterhead**: its logo on the left, its name, address, website, email and phone on the right (or the letter template's header instead, when the template has one), over a line in the **brand colour**. Headings and table headers in letters use the same colour, and the footer shows the contacts and "Page 1 of 2". Both are set on the **Settings** page; letters made before a change keep how they looked.

| Method | Path | What it does | Permission |
|---|---|---|---|
| `PUT` | `/v1/settings/logo` | Upload or replace the logo: multipart form, field `file` | Settings update |
| `DELETE` | `/v1/settings/logo` | Remove the logo (letters then show the name in the brand colour) | Settings update |
| `PATCH` | `/v1/settings` | `{brandColor: "#1E3A8A"}`; `null` or `""` = Firmli's default navy `#1E3A8A` | Settings update |

`GET /v1/settings` (and every settings answer) has:

```json
{
  "brandColor": "#0F766E",
  "logo": {"url": "https://...signed link...", "expiresIn": 300}
}
```

- `logo` is `null` without a logo. `logo.url` is a short-lived link: use it for the preview `<img>` right away, and load the settings again for a fresh link (do not store it).
- Logo: **PNG or JPG, at most 2 MB**. A wide logo on a transparent background looks best; it is drawn at most 170 × 52 points, keeping its shape. Other files answer `422` `{ "file": "Upload a PNG or JPG image" }`, a bigger one `{ "file": "The file must be at most 2 MB" }`, none `{ "file": "Choose a file to upload" }`.
- `brandColor`: `#` and 6 hex digits; it comes back in capitals. Anything else answers `422` `{ "brandColor": "Enter a colour like #1E3A8A" }`. A colour picker (`<input type="color">`) gives this format.
- Uploading, replacing and removing the logo are in the audit log (`logo`: "new logo" / "previous logo"), never the file itself.
- The institution's details on the letterhead come from the same Settings page (name, address, website, contact email, phone). If the letter template has its own header, it replaces the right-hand details; to avoid showing the name twice, leave the template header empty once a logo is uploaded.

```js
// Settings page: upload the chosen file, then show the new logo
async function uploadLogo(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE_URL}/settings/logo`, {
    method: "PUT",
    headers: {Authorization: `Bearer ${localStorage.getItem("token")}`}, // no Content-Type: the browser sets the multipart boundary
    body: form,
  });
  const json = await res.json();
  if (!json.success) throw Object.assign(new Error(json.message), {errors: json.errors});
  return json.data; // the settings, with logo.url
}

await api("/settings/logo", {method: "DELETE"});
await api("/settings", {method: "PATCH", body: {brandColor: "#0F766E"}});
```

#### Emails to students

Letter emails and document requests use the same branding: a bar in the brand colour, the logo (or the institution's name), the email text, a box naming the attached PDF, and a footer with the institution's name, address and contacts. The logo travels inside the email as an inline image, so it shows in Gmail / Outlook without loading anything.

On the **Communications** page, `GET /v1/emails/:id` answers `bodyHtml` ready for the browser: the inline logo (which only mail clients can show) already points to a short-lived link to the current logo, or is left out when the institution has no logo any more. Render it as it is (sanitized); no Settings permission is needed. Load the email again for a fresh link.

#### Letter template preview as PDF

`GET /v1/letter-templates/:id/preview-pdf?applicationId=85` answers the PDF itself (`Content-Type: application/pdf`, shown inline), exactly as a student would get it: letterhead with the logo, brand colour, tables, footer. Any status and type; nothing is saved. Needs Letter Templates read. It previews the **saved** template, so save the edits first (the HTML `/preview` is still there for a quick look).

The token is needed, so load it with `fetch` and show it from a blob:

```js
const res = await fetch(`${API_BASE_URL}/letter-templates/${templateId}/preview-pdf?applicationId=${applicationId}`, {
  headers: {Authorization: `Bearer ${localStorage.getItem("token")}`},
});
if (!res.ok) throw new Error((await res.json()).message); // errors are JSON as usual (404 "Application not found", 422 ...)
const url = URL.createObjectURL(await res.blob());
iframe.src = url; // call URL.revokeObjectURL(url) when the preview closes
```

### Dropdowns

Options for select boxes, all in one place and in one shape: `GET /v1/dropdowns/<name>` answers `data` as a plain array of `{value, label}`, sorted by label (roles by rank), from your own institution only. Any logged in user may load them, so a form never needs a module permission just to fill a select box. Send `value` back to the API; show `label`.

| Method | Path | Options | Query |
|---|---|---|---|
| `GET` | `/v1/dropdowns/programs` | The institution's programs: `value` = program id, `label` = `"MSc Data Science (MSDS)"` | `status` (`draft`, `active`, `inactive`, `archived`): e.g. `active` for the New Application form; `search`: part of the name or code; `withEligibilitySet=true` adds `eligibilitySet: {id, name}` (or `null`), the set each program uses now, e.g. for "Uses X set now" in Assign Programs |
| `GET` | `/v1/dropdowns/campuses` | The institution's campuses: `value` = campus id, `label` = `"Main Campus (Pune)"` (the city tells apart two campuses with the same name; just the name when there is no city) | `search`: part of the name |
| `GET` | `/v1/dropdowns/eligibility-sets` | Eligibility sets: `label` = name | `published=true`: only sets with a published version (applications can only be submitted to such a program); `search` |
| `GET` | `/v1/dropdowns/letter-templates` | Letter templates: `label` = name | `letterType` (`conditional_offer`, `rejection`, `manual_review`), `status` (`draft`, `published`), `search` |
| `GET` | `/v1/dropdowns/email-templates` | Email templates: `label` = name | `emailType` (`conditional_offer`, `rejection`, `manual_review`, `document_request`, `custom`), `status`, `search` |
| `GET` | `/v1/dropdowns/users` | The institution's users: `value` = user id, `label` = `"Riya Kapoor (Reviewer)"` (the role tells apart two people of the same name; no email, since any role may load this) | `role` (a role code, e.g. `reviewer`); `assignable=true`: only users who can log in (active, or not logged in yet), the ones an application or case can be given to; `search`: part of the name |
| `GET` | `/v1/dropdowns/roles` | The roles: `value` = role id, `label` = name, plus `code` (e.g. `super_admin`). Ordered from Super Admin down (not by name). Only a Super Admin may give or change the Super Admin role (others get `403`): disable that option unless the logged in user's `role` is `super_admin` | none |

The program form's selects, each with only the templates of its type:

| Field | Dropdown |
|---|---|
| Campus | `/dropdowns/campuses` |
| Eligibility Set | `/dropdowns/eligibility-sets` |
| Conditional Offer / Rejection / Manual Review Letter | `/dropdowns/letter-templates?letterType=conditional_offer` / `rejection` / `manual_review` |
| Offer Email / Rejection Email | `/dropdowns/email-templates?emailType=conditional_offer` / `rejection` |

A draft template can be picked, but a letter or email cannot be made from it until it is published; add `&status=published` to offer only ready ones.

```js
const programs = await api("/dropdowns/programs?status=active");
// [{"value": 207, "label": "MSc Data Science (MSDS)"}, {"value": 12, "label": "MBA (MBA1)"}]
```

- Deleted records never appear. A bad `status` answers `422` `{ "status": "status must be one of [...]" }`.
- More dropdowns will be added here, in the same shape.
