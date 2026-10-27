# Manual test: the full application flow

Test the whole product once, from an empty institution to an emailed offer letter, with ready-made sample data.

| | |
|---|---|
| **Log in as** | Arjun Mehta, `admin.sunrise@yopmail.com` (Super Admin, Sunrise University) |
| **Starting point** | Sunrise University is empty: no programs, campuses or templates |
| **Order** | Do the parts in order; each one needs the one before it |
| **Time** | About 1.5 hours |
| **Emails** | All go to `@yopmail.com`: open [yopmail.com](https://yopmail.com) and type the part before the `@` |

**Sample documents (11 PDFs):** copy this folder to your Desktop first.

```text
C:\Users\Admin\AppData\Local\Temp\claude\c--Users-Admin-Music-firmli-ai-offer-letter-backend\4676d91f-1d22-4922-b26d-75c0d0ba8c8d\scratchpad\sample-documents
```

### Contents

1. [Before you start](#1-before-you-start)
2. [Settings](#2-settings)
3. [Reviewer user](#3-reviewer-user)
4. [Campus](#4-campus)
5. [Eligibility criteria](#5-eligibility-criteria)
6. [Letter templates](#6-letter-templates)
7. [Email templates](#7-email-templates)
8. [Program](#8-program)
9. [Applications](#9-applications)
10. [Manual review](#10-manual-review)
11. [Letters and emails](#11-letters-and-emails)
12. [Automation](#12-automation)
13. [Final checks](#13-final-checks)

---

## 1. Before you start

- [ ] Backend restarted after the last `.env` change (mock S3 on `localhost:9100`)
- [ ] Docker running: `firmli-mysql`, `firmli-s3` and `redis`
- [ ] `npm test` passes
- [ ] Your OpenAI API key is ready (pasted in part 2)

---

## 2. Settings

Open **Settings** and fill these sections, then **Save**.

### Institution Details

| Field | Value |
|---|---|
| Name | `Sunrise University` |
| Contact email | `admissions.sunrise@yopmail.com` |
| Phone | `+91 98765 43210` |
| Address | `21 College Road, Ludhiana, Punjab` |
| Website | `https://www.sunrise-university.example.com` |

### AI Configuration

| Field | Value |
|---|---|
| OpenAI API key | your key (`sk-...`) |
| Models and prompts | leave as they are |

### Automation (first run: only the assessment is automatic)

| Switch | Value |
|---|---|
| Automatic assessment | **ON** |
| Automatic letter generation | OFF |
| Automatic email dispatch | OFF |

### Decision Safety

| Switch | Value |
|---|---|
| Auto-approve offers | OFF |
| Auto-approve rejections | OFF |
| Require approval for rejections | **ON** |
| Require manual review for edge cases | **ON** |
| Flag low confidence | **ON** |
| Flag missing documents | **ON** |

> **Expected:** "Settings saved". The OpenAI key shows masked, like `sk-...abcd`.

---

## 3. Reviewer user

Open **Users** → **Add user**.

| Field | Value |
|---|---|
| Name | `Neha Sharma` |
| Email | `neha.reviewer@yopmail.com` |
| Password | `Review@12345` |
| Role | Reviewer |

- [ ] Press **Send by Email** → the login details arrive at `neha.reviewer@yopmail.com`
- [ ] Back in **Settings**: **Default reviewer** = Neha Sharma → Save

---

## 4. Campus

Open **Campuses** → **Add campus**.

| Field | Value |
|---|---|
| Name | `Main Campus` |
| Country / State / City | India / Punjab / Ludhiana |

---

## 5. Eligibility criteria

Open **Eligibility** → **New set**, name it `UK Masters Standard`.

### Criteria

| Field | Criterion 1 | Criterion 2 |
|---|---|---|
| Name | `Minimum GPA` | `IELTS overall band` |
| Category | Academic Qualification | English Proficiency |
| Data type | Number | Number |
| Operator | Greater than or equal to | Greater than or equal to |
| Required value | `3.0` | `6.5` |
| Unit | `GPA on a 4.0 scale` | `IELTS band` |
| Documents | Academic Transcript | English Language Certificate |
| Mandatory | Yes | Yes |
| Rejection reason | `Your cumulative GPA is below the minimum of 3.0.` | `Your IELTS overall band is below 6.5.` |

### Required documents

| Document | Required |
|---|---|
| Academic Transcript | Yes |
| English Language Certificate | Yes |
| Passport | No (optional) |

- [ ] Press **Publish**

> **Expected:** Version 1 shows as **Published**.

---

## 6. Letter templates

Open **Letter Templates** → **New template**. Create all three and set each to **Published**.

### 6.1 Offer letter

| Field | Value |
|---|---|
| Name | `Sunrise Conditional Offer` |
| Type | Conditional Offer |
| Reference prefix | `OFR` |
| Subject | `Conditional offer for {{student_full_name}}` |
| Signatory name | `Dr. Arjun Mehta` |
| Signatory title | `Director of Admissions` |
| Header | `{{institution_name}} \| {{institution_website}}` |
| Footer | `{{institution_name}}, {{institution_address}}` |

Body (copy as it is):

```text
{{decision_date}}
Ref: {{application_number}}

Dear {{student_full_name}},

We are pleased to offer you a place on {{program_name}} ({{program_code}}) at {{campus}}, starting {{intake}}.
Please accept this offer by {{offer_expiry_date}}.

Conditions:
{{conditions}}

Requirements checked:
{{eligibility_table}}

Your documents:
{{document_checklist}}

Yours sincerely,
{{signatory_name}}
{{signatory_title}}
```

### 6.2 Rejection letter

| Field | Value |
|---|---|
| Name | `Sunrise Rejection` |
| Type | Rejection |
| Reference prefix | `REJ` |
| Subject | `Your application {{application_number}}` |
| Signatory name | `Dr. Arjun Mehta` |

Body:

```text
Dear {{student_full_name}},

Thank you for applying to {{program_name}}. We are unable to offer you a place, for these reasons:
{{unmet_requirements}}

Requirements checked:
{{eligibility_table}}

Yours sincerely,
{{signatory_name}}
```

### 6.3 Manual review letter

| Field | Value |
|---|---|
| Name | `Sunrise Under Review` |
| Type | Manual Review |
| Reference prefix | `MRV` |
| Subject | `Your application is being reviewed` |

Body:

```text
Dear {{student_full_name}},

Your application {{application_number}} is with our admissions team.
We still need: {{missing_documents}}
```

---

## 7. Email templates

Open **Email Templates** → **New template**. Create both, with **Attach PDF letter ON**, and set each to **Published**.

### 7.1 Offer email

| Field | Value |
|---|---|
| Name | `Sunrise Offer Email` |
| Type | Conditional Offer |
| Subject | `Your offer from {{institution_name}}` |
| Attach PDF letter | **ON** |

Body:

```text
Dear {{student_full_name}},

Congratulations! Your conditional offer letter for {{program_name}} is attached.

Admissions Office, {{institution_name}}
```

### 7.2 Rejection email

| Field | Value |
|---|---|
| Name | `Sunrise Rejection Email` |
| Type | Rejection |
| Subject | `Your application to {{institution_name}}` |
| Attach PDF letter | **ON** |

Body:

```text
Dear {{student_full_name}},

Please find attached the decision on your application {{application_number}}.
```

---

## 8. Program

Open **Programs** → **New program**.

| Field | Value |
|---|---|
| Name | `MSc Data Science` |
| Code | `MSDS` |
| Award level | `Masters` |
| Campus | Main Campus |
| Duration | `1 year` |
| Study mode | Full Time |
| Status | Active |
| Eligibility set | UK Masters Standard |
| Conditional offer template | Sunrise Conditional Offer |
| Rejection template | Sunrise Rejection |
| Manual review template | Sunrise Under Review |
| Offer email template | Sunrise Offer Email |
| Rejection email template | Sunrise Rejection Email |

---

## 9. Applications

Open **Applications** → **New Application**. For every student: program **MSc Data Science**, intake **Fall 2026**, upload the files, then **Submit**.

| # | Student | Email | Upload (file → document type) | Expected result |
|---|---|---|---|---|
| 1 | Amara Okafor | `amara.okafor@yopmail.com` | `1-Amara-Okafor_transcript.pdf` → Academic Transcript<br>`1-Amara-Okafor_ielts.pdf` → English Language Certificate<br>`1-Amara-Okafor_passport.pdf` → Passport | ✅ **Offer**: GPA 3.62 met, IELTS 7.0 met |
| 2 | Bola Adeyemi | `bola.adeyemi@yopmail.com` | `2-Bola-Adeyemi_transcript.pdf` → Academic Transcript<br>`2-Bola-Adeyemi_ielts.pdf` → English Language Certificate | ❌ **Rejection**: GPA 2.40 not met |
| 3 | Chidi Nwosu | `chidi.nwosu@yopmail.com` | **Only** `3-Chidi-Nwosu_transcript.pdf` → Academic Transcript | 🟡 **Manual Review**: "Missing documents", priority High, assigned to Neha |
| 4 | Dami Bello | `dami.bello@yopmail.com` | `4-Dami-Bello_transcript.pdf` → Academic Transcript<br>`4-Dami-Bello_ielts.pdf` → English Language Certificate | ❌ **Rejection**: IELTS 6.0 not met |
| 5 | Esther Obi | `esther.obi@yopmail.com` | `5-Esther-Obi_WRONG-passport-as-transcript.pdf` → Academic Transcript<br>`5-Esther-Obi_ielts.pdf` → English Language Certificate | 🟡 **Manual Review**: "Document does not match its type" |

> **Expected:** after Submit the status is **Processing** for 10 to 60 seconds, then the result above. Open each application's **Assessment**: every criterion shows the value found, the evidence and the source document.

---

## 10. Manual review

Log in as **Neha Sharma** (`neha.reviewer@yopmail.com` / `Review@12345`) in a second browser (incognito).

| Step | Who | Do this | Expected |
|---|---|---|---|
| 10.1 | Neha | Open **Chidi's** case → **Request documents**: English Language Certificate, message `Please upload your IELTS report.` | Email at `chidi.nwosu@yopmail.com`; status **Waiting for Documents** |
| 10.2 | Arjun | Upload `3-Chidi-Nwosu_ielts_UPLOAD-LATER.pdf` to Chidi's application (English Language Certificate) | Case goes back to **In Review** |
| 10.3 | Neha | Add note `IELTS received, 6.5` → **Return for reassessment** | AI runs again → Chidi becomes **Offer** (6.5 meets 6.5) |
| 10.4 | Neha | Open **Esther's** case → override **Minimum GPA** to Not met, note `Transcript not provided` → **Reject**, reason `No academic transcript` | Esther **Rejection**, decided by Neha |

---

## 11. Letters and emails

Back as **Arjun**.

| Step | Do this | Expected |
|---|---|---|
| 11.1 | Amara → **Generate Letter** | Letter `OFR-...-1`, status **Waiting for Approval** |
| 11.2 | **Download PDF** | Amara's name, both tables, header and footer are right |
| 11.3 | **Approve** → **Send Email** | Email at `amara.okafor@yopmail.com` with the PDF attached |
| 11.4 | Bola → **Generate Letter** → **Approve** → **Send Email** | Letter `REJ-...-1`; email with the PDF at `bola.adeyemi@yopmail.com` |
| 11.5 | Dami → **Generate Letter**, then **Send Email** without approving | Refused: "Only an approved letter can be emailed" |

---

## 12. Automation

| Step | Do this | Expected |
|---|---|---|
| 12.1 | **Settings**: Automatic letter generation **ON**, Automatic email dispatch **ON**, Auto-approve offers **ON** → Save | Saved |
| 12.2 | New application: **Femi Johnson**, `femi.johnson@yopmail.com`; upload Amara's transcript and IELTS files → Submit | With no clicks: **Offer** → letter generated and **Approved** → email with PDF at `femi.johnson@yopmail.com` (allow 1 to 2 minutes) |

---

## 13. Final checks

- [ ] **Dashboard**: 6 applications; offers, rejections and manual review match; letters waiting; emails sent
- [ ] **Bell**: counts match (for example letters waiting)
- [ ] **Activity tab** of Amara: every step from created to email sent
- [ ] **Communications**: every email (the document request too), all **Sent**
- [ ] **Reports**: numbers by program; **Export CSV** opens in Excel
- [ ] **AI Usage**: one row per AI call, with tokens
- [ ] **Audit log**: Arjun sees everything; Neha sees only her own changes

---

## Found a bug?

Send these four things:

| | Example |
|---|---|
| Step | `10.3` |
| Expected | Chidi becomes Offer |
| What happened | Still in Manual Review |
| Request id | `X-Request-Id` from the failing call (browser DevTools → Network → the request → Response headers) |
