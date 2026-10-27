import crypto from "node:crypto";
import path from "node:path";
import _ from "lodash";
import nodemailer from "nodemailer";
import config from "../configs/env.config.js";
import logger from "../utils/logger.util.js";
import {ApiError} from "../utils/ApiError.js";
import {HTTP_RESPONSES} from "../constants/http-response-messages.constants.js";
import {DEFAULT_BRAND_COLOR} from "../constants/settings.constants.js";
import dbHelper from "./db.helper.js";
import cryptoHelper from "./crypto.helper.js";
import storageHelper from "./storage.helper.js";
import networkHelper from "./network.helper.js";

const {mail} = config;

// The 503 message when neither the client nor Firmli has a mail server
export const EMAIL_NOT_CONFIGURED = "Email is not configured";

// Content id of the institution's logo inside a branded email (<img src="cid:institution-logo">)
export const LOGO_CID = "institution-logo";

const escape = (value) => _.escape(String(value ?? ""));

// A slow or unreachable server fails the request instead of hanging it
const TIMEOUTS = {connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000};

// Pooled: sends reuse open connections instead of a new TCP / TLS handshake for every email
// servername: the name the TLS certificate must match when host is an IP address
const createTransport = ({host, servername, port, secure, user, password}) =>
    nodemailer.createTransport({
        host,
        port,
        secure,
        ...(servername && servername !== host ? {tls: {servername}} : {}),
        ...(user ? {auth: {user, pass: password}} : {}),
        pool: true,
        ...TIMEOUTS,
    });

// Firmli's own SMTP (SMTP_* in the env file): every client's default
const firmliTransport = mail.enabled ? createTransport(mail) : null;

// tenantId -> {key, transport} of the client's own SMTP; made again only when its settings change
const customTransports = new Map();

// MAIL_FROM "Firmli <no-reply@firmli.com>" -> its address (the name is replaced by the institution's)
const firmliAddress = mail.from.match(/<([^>]+)>/)?.[1] ?? mail.from;

/**
 * Sends email. Each client (tenant) uses its own SMTP server when it connected one in Settings,
 * otherwise Firmli's from the env file, sent in the institution's name:
 *
 *   await emailHelper.send({tenantId, to: "riya@yopmail.com", subject: "Hello", html: "<p>Hi</p>", text: "Hi"});
 *
 * Email contents live in src/v1/emails. Throws 503 when there is no server to send with, and 502
 * when the server refuses (with the server's reason when explainErrors is set, e.g. for a test email).
 */
const emailHelper = {
    send: async ({tenantId, to, cc, bcc, subject, html, text, replyTo, attachments, messageId}, {explainErrors = false} = {}) => {
        const sender = await emailHelper.senderFor(tenantId);
        if (!sender) throw ApiError.of(HTTP_RESPONSES.HTTP_SERVICE_UNAVAILABLE, EMAIL_NOT_CONFIGURED);
        try {
            const info = await sender.transport.sendMail({
                from: sender.from,
                to,
                subject,
                html,
                text,
                ..._.omitBy({cc, bcc, replyTo, attachments, messageId}, _.isEmpty),
            });
            logger.info({tenantId, to, subject, sender: sender.type, messageId: info.messageId}, "Email sent");
            return {...info, sender: sender.type, fromEmail: sender.from.address};
        } catch (error) {
            logger.error({err: error, tenantId, to, subject, sender: sender.type}, "Email could not be sent");
            const reason = explainErrors ? `: ${error.message}` : ", please try again";
            throw ApiError.of(HTTP_RESPONSES.HTTP_BAD_GATEWAY, `The email could not be sent${reason}`);
        }
    },

    /**
     * {type, transport, from} for this tenant: "custom" with its own SMTP when it is switched on,
     * else "default" (Firmli's), or null when there is neither.
     */
    senderFor: async (tenantId) => {
        const row = tenantId
            ? await dbHelper.selectOne(
                  `SELECT t.name, s.smtp_enabled AS enabled, s.smtp_host AS host, s.smtp_port AS port, s.smtp_secure AS secure,
                          s.smtp_user AS user, s.smtp_password_encrypted AS passwordEncrypted,
                          s.smtp_from_email AS fromEmail, s.smtp_from_name AS fromName
                   FROM tenants t JOIN tenant_settings s ON s.tenant_id = t.id AND s.deleted_at IS NULL
                   WHERE t.id = :tenantId`,
                  {tenantId}
              )
            : null;

        if (row?.enabled) {
            return {
                type: "custom",
                transport: await emailHelper.customTransport(tenantId, row),
                from: {name: row.fromName || row.name, address: row.fromEmail},
            };
        }
        if (!firmliTransport) return null;
        return {type: "default", transport: firmliTransport, from: {name: row?.name ?? "Firmli", address: firmliAddress}};
    },

    /**
     * The tenant's pooled transport, made again (and the old one closed) when its SMTP settings or the server's
     * address changed. Outside development it connects to the address the host resolves to now, only when that
     * is a public one (the name could point into our own network); TLS still checks the certificate for the name.
     */
    customTransport: async (tenantId, row) => {
        const address = config.isDevelopment ? row.host : await emailHelper.smtpAddressOf(row.host);
        const key = JSON.stringify([row.host, address, row.port, row.secure, row.user, row.passwordEncrypted]);
        const cached = customTransports.get(tenantId);
        if (cached?.key === key) return cached.transport;
        cached?.transport.close();
        const password = row.passwordEncrypted ? cryptoHelper.decrypt(row.passwordEncrypted) : null;
        const transport = createTransport({host: address, servername: row.host, port: row.port, secure: Boolean(row.secure), user: row.user, password});
        customTransports.set(tenantId, {key, transport});
        return transport;
    },

    smtpAddressOf: async (host) => {
        const address = await networkHelper.publicAddressOf(host).catch(() => undefined);
        if (address) return address;
        const reason = address === undefined ? `the SMTP server ${host} was not found` : `the SMTP server ${host} is not a public server`;
        throw ApiError.of(HTTP_RESPONSES.HTTP_BAD_GATEWAY, `The email could not be sent: ${reason}`);
    },

    /**
     * A new Message-ID header, <uuid@domain of MAIL_FROM>, for an email whose replies should be found later:
     * a reply names it in its In-Reply-To / References headers. Made once and sent on every try of that email
     */
    newMessageId: () => `<${crypto.randomUUID()}@${firmliAddress.split("@")[1] || "firmli.com"}>`,

    // "Apex Study Abroad <no-reply@firmli.com>": Firmli's sender in the institution's name; null without Firmli SMTP
    firmliFrom: (institutionName) => (firmliTransport ? `${institutionName} <${firmliAddress}>` : null),

    /**
     * Wraps body HTML in an email-client-safe layout (tables and inline styles; title optional).
     * With brand (emails to students) it carries the institution's look: a bar in its colour, its logo
     * (sent with the email as the inline image LOGO_CID, see logoAttachment) or its name, and a footer
     * with its contact details. attachmentName shows a box saying which file is attached.
     */
    layout: ({title, body, footer, brand, attachmentName}) => {
        const color = brand?.color ?? DEFAULT_BRAND_COLOR;
        const header = brand
            ? `<tr><td style="background:${color};height:4px;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:24px 32px;border-bottom:1px solid #e5e7eb">${
                  brand.hasLogo
                      ? `<img src="cid:${LOGO_CID}" alt="${escape(brand.name)}" height="48" style="display:block;height:48px;max-width:240px;border:0">`
                      : `<span style="font-size:20px;font-weight:bold;color:${color}">${escape(brand.name)}</span>`
              }</td></tr>`
            : "";
        const attachment = attachmentName
            ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0 0"><tr>
<td style="border:1px solid #e5e7eb;border-left:4px solid ${color};border-radius:8px;padding:12px 16px;background:#f9fafb;font-size:14px">
&#128206; <strong>${escape(attachmentName)}</strong> is attached to this email</td></tr></table>`
            : "";
        const contacts = brand ? _.compact([brand.website, brand.email, brand.phone]).map(escape).join(" &nbsp;·&nbsp; ") : "";
        const brandFooter = brand
            ? `<tr><td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.6;color:#6b7280">
<strong style="color:#374151">${escape(brand.name)}</strong>${brand.address ? `<br>${escape(brand.address)}` : ""}${contacts ? `<br>${contacts}` : ""}
${brand.email ? `<br>Questions? Just reply to this email.` : ""}</td></tr>`
            : "";
        return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>p{margin:0 0 14px}a{color:${color}}</style></head>
<body style="margin:0;padding:24px 12px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
${header}
<tr><td style="padding:32px;font-size:15px;line-height:1.6">
${title ? `<h1 style="margin:0 0 16px;font-size:20px;color:${brand ? color : "#111827"}">${title}</h1>` : ""}
${body}
${attachment}
${footer ? `<p style="margin:24px 0 0;font-size:12px;color:#6b7280">${footer}</p>` : ""}
</td></tr>
${brandFooter}
</table>
</td></tr></table>
</body></html>`;
    },

    // The logo of a branded email, attached as the inline image the layout points to (null without a logo)
    logoAttachment: async (logoStorageKey) => {
        if (!logoStorageKey) return null;
        try {
            return {filename: `logo${path.extname(logoStorageKey)}`, content: await storageHelper.read(logoStorageKey), cid: LOGO_CID};
        } catch (error) {
            logger.warn({err: error, key: logoStorageKey}, "Logo not added to the email");
            return null;
        }
    },

    // Values from users or the database must go through this before they are put into HTML
    escape,
};

export default emailHelper;
