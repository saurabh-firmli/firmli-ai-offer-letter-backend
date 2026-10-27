import path from "node:path";
import _ from "lodash";
import {Op} from "sequelize";
import databaseModel from "../utils/database.util.js";
import logger from "../utils/logger.util.js";
import {ApiError} from "../utils/ApiError.js";
import {HTTP_RESPONSES} from "../constants/http-response-messages.constants.js";
import {EMAIL_TYPE_LABELS, PROGRAM_EMAIL_TEMPLATE_FIELDS} from "../constants/email-template.constants.js";
import {LETTER_STATUSES} from "../constants/letter.constants.js";
import {
    RETRY_BATCH_SIZE,
    RETRY_FIRST_DELAY_MINUTES,
    RETRY_MAX_DELAY_MINUTES,
    STUCK_SENDING_MINUTES,
    STUDENT_EMAIL_STATUS_LABELS,
    STUDENT_EMAIL_STATUSES,
} from "../constants/communication.constants.js";
import dbHelper from "../helpers/db.helper.js";
import emailHelper, {LOGO_CID} from "../helpers/email.helper.js";
import storageHelper from "../helpers/storage.helper.js";
import phoneHelper from "../helpers/phone.helper.js";
import realtimeHelper from "../helpers/realtime.helper.js";
import letterService from "./letter.service.js";
import letterTemplateService from "./letterTemplate.service.js";
import emailTemplateService from "./emailTemplate.service.js";
import settingsService from "./settings.service.js";

const NOT_FOUND = "Email not found";
const NOT_CONFIGURED = HTTP_RESPONSES.HTTP_SERVICE_UNAVAILABLE.statusCode;
const conflict = (message) => ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, message);

const EMAIL_COLUMNS = `
    e.id, e.application_id AS applicationId, a.application_number AS applicationNumber, e.letter_id AS letterId,
    l.reference_number AS letterReference, e.template_id AS templateId, t.name AS templateName, e.email_type AS emailType,
    e.recipient, e.cc, e.bcc, e.subject, e.attach_letter AS attachLetter, e.status, e.attempts, e.max_attempts AS maxAttempts, e.last_error AS lastError,
    e.next_retry_at AS nextRetryAt, e.sent_at AS sentAt, e.sender, e.sent_by AS sentById, u.name AS sentByName, e.created_at AS createdAt`;

const EMAIL_FROM = `
    FROM application_emails e
    LEFT JOIN applications a ON a.id = e.application_id
    LEFT JOIN application_letters l ON l.id = e.letter_id
    LEFT JOIN email_templates t ON t.id = e.template_id
    LEFT JOIN users u ON u.id = e.sent_by
    WHERE e.deleted_at IS NULL`;

// "<p>Hi</p><p>Bye</p>" -> "Hi\n\nBye", for the plain text part of an email
const textFromHtml = (html) =>
    _.unescape(
        html
            .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr)\b[^>]*>/gi, "\n")
            .replace(/<li\b[^>]*>/gi, "- ")
            .replace(/<[^>]+>/g, "")
    )
        .replace(/\n{3,}/g, "\n\n")
        .trim();

/**
 * Emails to students (the Communications page): every one is logged in application_emails as it was
 * sent. A failed send is retried by itself, waiting longer each time, up to 1 + Settings emailMaxRetries
 * tries; after that it can be retried by hand. A missing mail server fails at once (retrying cannot help).
 */
const communicationService = {
    /**
     * Send Email for a letter: the program's email template for the letter type (or templateId),
     * filled like the letter, to the student, with the PDF attached when the template says so.
     * Only an approved letter is sent.
     */
    sendLetter: async (letterId, {templateId} = {}, user) => {
        const letter = await dbHelper.selectOneOrFail(
            `SELECT l.id, l.application_id AS applicationId, l.letter_type AS letterType, l.status, l.template_id AS letterTemplateId,
                    l.reference_number AS referenceNumber, p.offer_email_template_id AS offerEmailTemplateId,
                    p.rejection_email_template_id AS rejectionEmailTemplateId
             FROM application_letters l JOIN applications a ON a.id = l.application_id JOIN programs p ON p.id = a.program_id
             WHERE l.id = :letterId AND l.tenant_id = :tenantId AND l.deleted_at IS NULL`,
            {letterId, tenantId: user.tenantId},
            "Letter not found"
        );
        if (letter.status !== LETTER_STATUSES.APPROVED) throw conflict("Only an approved letter can be emailed");

        const [template, application, letterTemplate] = await Promise.all([
            communicationService.emailTemplateFor(letter, templateId, user.tenantId),
            letterService.findApplication(letter.applicationId, user.tenantId),
            letter.letterTemplateId ? letterTemplateService.getById(letter.letterTemplateId, user.tenantId).catch(() => ({})) : {},
        ]);
        const filled = letterService.render({subject: template.subject, body: template.body}, await letterService.values(application, letterTemplate));

        return communicationService.deliver(
            {
                tenantId: user.tenantId,
                applicationId: letter.applicationId,
                letterId: letter.id,
                attachLetter: template.attachPdfLetter,
                templateId: template.id,
                emailType: letter.letterType,
                recipient: application.studentEmail,
                cc: template.cc,
                bcc: template.bcc,
                subject: filled.subject || `${application.institutionName}: ${EMAIL_TYPE_LABELS[letter.letterType]}`,
                bodyHtml: emailHelper.layout({
                    title: null,
                    body: filled.bodyHtml,
                    brand: communicationService.brandOf(application),
                    attachmentName: template.attachPdfLetter ? `${letter.referenceNumber}.pdf` : null,
                }),
                bodyText: textFromHtml(filled.bodyHtml),
            },
            user
        );
    },

    // The institution's look for an email to its student (layout of emailHelper), from a letterService.findApplication row
    brandOf: (application) => ({
        name: application.institutionName,
        color: application.brandColor,
        hasLogo: Boolean(application.logoStorageKey),
        address: application.institutionAddress,
        website: application.institutionWebsite,
        email: application.institutionEmail,
        phone: phoneHelper.display(application.institutionPhone),
    }),

    // templateId when sent, else the program's template for the letter type; published, of that type
    emailTemplateFor: async (letter, templateId, tenantId) => {
        const id = templateId ?? letter[PROGRAM_EMAIL_TEMPLATE_FIELDS[letter.letterType]];
        const label = EMAIL_TYPE_LABELS[letter.letterType];
        if (!id) throw conflict(`Pick a ${label} email template on the program, or send templateId`);
        const template = await emailTemplateService.getById(id, tenantId);
        if (template.emailType !== letter.letterType) throw ApiError.validation({templateId: `Pick a ${label} email template`});
        if (template.status !== "published") throw conflict(`The ${label} email template is a draft; publish it first`);
        return template;
    },

    /**
     * Logs the email and makes the first try. Answers the logged email; its status tells how the
     * first try went (sent, retrying or failed).
     */
    deliver: async (email, user) => {
        const {emailMaxRetries} = await settingsService.flags(email.tenantId);
        const created = await databaseModel.applicationEmail.create({
            ...email,
            status: STUDENT_EMAIL_STATUSES.SENDING,
            maxAttempts: 1 + emailMaxRetries,
            sentBy: user?.id ?? null,
            // Its own Message-ID, the same on every try, so a student's reply can be matched to it later
            messageId: emailHelper.newMessageId(),
        });
        await communicationService.attempt(created.id);
        return communicationService.getById(created.id, email.tenantId);
    },

    // One try of a logged email that is "sending"; records the result
    attempt: async (id) => {
        const email = await dbHelper.selectOne(
            `SELECT e.id, e.tenant_id AS tenantId, e.application_id AS applicationId, e.recipient, e.cc, e.bcc, e.subject,
                    e.body_html AS bodyHtml, e.body_text AS bodyText,
                    e.attempts, e.max_attempts AS maxAttempts, e.attach_letter AS attachLetter, e.message_id AS messageId,
                    l.pdf_storage_key AS pdfStorageKey, l.reference_number AS letterReference,
                    t.contact_email AS replyTo, t.logo_storage_key AS logoStorageKey
             FROM application_emails e JOIN tenants t ON t.id = e.tenant_id LEFT JOIN application_letters l ON l.id = e.letter_id
             WHERE e.id = :id`,
            {id}
        );
        const attempts = email.attempts + 1;
        let status = STUDENT_EMAIL_STATUSES.SENT;
        try {
            const attachments = email.attachLetter
                ? [{filename: `${email.letterReference}.pdf`, content: await storageHelper.read(email.pdfStorageKey), contentType: "application/pdf"}]
                : [];
            // A branded email shows the institution's logo as an inline image, sent along with it
            const logo = email.bodyHtml.includes(`cid:${LOGO_CID}`) ? await emailHelper.logoAttachment(email.logoStorageKey) : null;
            if (logo) attachments.push(logo);
            const info = await emailHelper.send(
                {
                    tenantId: email.tenantId,
                    to: email.recipient,
                    cc: email.cc,
                    bcc: email.bcc,
                    replyTo: email.replyTo,
                    subject: email.subject,
                    html: email.bodyHtml,
                    text: email.bodyText,
                    attachments,
                    messageId: email.messageId,
                },
                {explainErrors: true}
            );
            await databaseModel.applicationEmail.update(
                {
                    status: STUDENT_EMAIL_STATUSES.SENT,
                    attempts,
                    sentAt: new Date(),
                    sender: info.sender,
                    providerMessageId: info.messageId ? _.truncate(info.messageId, {length: 255}) : null,
                    // The mailbox a reply lands in: replyTo, or fromEmail without it
                    fromEmail: info.fromEmail,
                    replyTo: email.replyTo || null,
                    // An email logged before Message-IDs were made here keeps the one nodemailer gave it
                    ...(email.messageId ? {} : {messageId: info.messageId ?? null}),
                    lastError: null,
                    nextRetryAt: null,
                },
                {where: {id}}
            );
        } catch (error) {
            const canRetry = error.statusCode !== NOT_CONFIGURED && attempts < email.maxAttempts;
            status = canRetry ? STUDENT_EMAIL_STATUSES.RETRYING : STUDENT_EMAIL_STATUSES.FAILED;
            await databaseModel.applicationEmail.update(
                {
                    status,
                    attempts,
                    lastError: _.truncate(error.message, {length: 500}),
                    nextRetryAt: canRetry ? communicationService.nextRetryAt(attempts) : null,
                },
                {where: {id}}
            );
        }
        realtimeHelper.publish(email.tenantId, "email.updated", {applicationId: email.applicationId, emailId: id, status});
    },

    // 5, 10, 20 ... minutes after the try, at most 6 hours
    nextRetryAt: (attempts) => {
        const minutes = Math.min(RETRY_FIRST_DELAY_MINUTES * 2 ** (attempts - 1), RETRY_MAX_DELAY_MINUTES);
        return new Date(Date.now() + minutes * 60_000);
    },

    // Retry by hand: a failed (or waiting) email is tried again now, also past its max attempts
    retry: async (id, user) => {
        await communicationService.getById(id, user.tenantId);
        const claimed = await communicationService.claim(id, [STUDENT_EMAIL_STATUSES.FAILED, STUDENT_EMAIL_STATUSES.RETRYING]);
        if (!claimed) throw conflict("Only a failed or waiting email can be retried");
        await databaseModel.applicationEmail.update(
            {maxAttempts: databaseModel.sequelize.literal("GREATEST(max_attempts, attempts + 1)")},
            {where: {id}}
        );
        await communicationService.attempt(id);
        return communicationService.getById(id, user.tenantId);
    },

    // Sets "sending" only if the email is still in one of these statuses, so two workers never send it twice
    claim: async (id, statuses) => {
        const [count] = await databaseModel.applicationEmail.update(
            {status: STUDENT_EMAIL_STATUSES.SENDING},
            {where: {id, status: statuses}}
        );
        return count === 1;
    },

    // The background loop: emails whose next try is due
    retryDue: async () => {
        const due = await dbHelper.select(
            `SELECT id FROM application_emails WHERE status = 'retrying' AND next_retry_at <= NOW() AND deleted_at IS NULL
             ORDER BY next_retry_at LIMIT ${RETRY_BATCH_SIZE}`
        );
        for (const {id} of due) {
            if (await communicationService.claim(id, [STUDENT_EMAIL_STATUSES.RETRYING])) await communicationService.attempt(id);
        }
        if (due.length) logger.info({count: due.length}, "Retried emails");
    },

    /**
     * At startup and on every round of the loop: emails cut off while sending (a process stopped or crashed)
     * are tried again. Only those "sending" for STUCK_SENDING_MINUTES: a younger one may be in the middle of its try in another process
     */
    recoverInterrupted: async () => {
        const [count] = await databaseModel.applicationEmail.update(
            {status: STUDENT_EMAIL_STATUSES.RETRYING, nextRetryAt: new Date()},
            {where: {status: STUDENT_EMAIL_STATUSES.SENDING, updatedAt: {[Op.lt]: new Date(Date.now() - STUCK_SENDING_MINUTES * 60_000)}}}
        );
        if (count) logger.warn({count}, "Emails cut off while sending will be retried");
    },

    list: async ({page, limit, status, emailType, applicationId, search}, tenantId) => {
        const conditions = ["e.tenant_id = :tenantId"];
        if (emailType) conditions.push("e.email_type = :emailType");
        if (applicationId) conditions.push("e.application_id = :applicationId");
        if (search) conditions.push("(e.recipient LIKE :search OR e.subject LIKE :search OR a.application_number LIKE :search)");
        const replacements = {tenantId, status, emailType, applicationId, search: search && dbHelper.likePattern(search)};
        const from = `FROM application_emails e LEFT JOIN applications a ON a.id = e.application_id WHERE e.deleted_at IS NULL AND ${conditions.join(" AND ")}`;

        const statusCondition = status ? " AND e.status = :status" : "";
        const [statusCounts, rows] = await Promise.all([
            dbHelper.select(`SELECT e.status, COUNT(*) AS count ${from} GROUP BY e.status`, replacements),
            dbHelper.select(
                `SELECT ${EMAIL_COLUMNS} ${EMAIL_FROM} AND ${conditions.join(" AND ")}${statusCondition} ORDER BY e.id DESC LIMIT :limit OFFSET :offset`,
                {...replacements, limit, offset: (page - 1) * limit}
            ),
        ]);
        const counts = dbHelper.countsBy(statusCounts, STUDENT_EMAIL_STATUS_LABELS);
        return {items: rows.map(communicationService.toResponse), total: status ? counts[status] : _.sum(_.values(counts)), page, limit, counts};
    },

    // One email with its body, as it was sent
    getById: async (id, tenantId) => {
        const row = await dbHelper.selectOneOrFail(
            `SELECT ${EMAIL_COLUMNS}, e.body_html AS bodyHtml, e.body_text AS bodyText ${EMAIL_FROM} AND e.id = :id AND e.tenant_id = :tenantId`,
            {id, tenantId},
            NOT_FOUND
        );
        return {...communicationService.toResponse(row), bodyHtml: await communicationService.viewableHtml(row.bodyHtml, tenantId), bodyText: row.bodyText};
    },

    /**
     * The email as a browser can show it: the inline logo (cid:, which only a mail client resolves) points
     * to a short-lived link to the current logo instead, or is left out when there is no logo any more.
     * The stored email stays as it was sent.
     */
    viewableHtml: async (html, tenantId) => {
        if (!html?.includes(`cid:${LOGO_CID}`)) return html;
        const key = await settingsService.logoKey(tenantId);
        if (!key) return html.replace(new RegExp(`<img src="cid:${LOGO_CID}"[^>]*>`, "g"), "");
        const {url} = await storageHelper.downloadUrl(key, `logo${path.extname(key)}`, {inline: true});
        return html.replaceAll(`cid:${LOGO_CID}`, _.escape(url));
    },

    toResponse: (row) => ({
        id: row.id,
        emailType: row.emailType,
        status: row.status,
        recipient: row.recipient,
        cc: row.cc,
        bcc: row.bcc,
        subject: row.subject,
        application: row.applicationId ? {id: row.applicationId, applicationNumber: row.applicationNumber} : null,
        letter: row.letterId ? {id: row.letterId, referenceNumber: row.letterReference} : null,
        attachLetter: Boolean(row.attachLetter),
        template: row.templateId ? {id: row.templateId, name: row.templateName} : null,
        attempts: row.attempts,
        maxAttempts: row.maxAttempts,
        lastError: row.lastError,
        nextRetryAt: row.nextRetryAt,
        sentAt: row.sentAt,
        sender: row.sender,
        sentBy: row.sentById ? {id: row.sentById, name: row.sentByName} : null,
        createdAt: row.createdAt,
    }),
};

export default communicationService;
