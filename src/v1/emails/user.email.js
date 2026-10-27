import config from "../configs/env.config.js";
import emailHelper from "../helpers/email.helper.js";

const {escape} = emailHelper;

// Emails to the app's users (staff of an institution). Each returns {subject, html, text} for emailHelper.send
const userEmails = {
    // The "Send by Email" button after creating a user: their login page, email and password
    credentials: ({name, email, password, institutionName}) => {
        const loginUrl = `${config.frontendUrl}/login?email=${encodeURIComponent(email)}`;
        const row = (label, value) =>
            `<tr><td style="padding:8px 0;color:#6b7280;width:110px">${label}</td><td style="padding:8px 0;font-weight:bold">${value}</td></tr>`;
        return {
            subject: `Your ${institutionName} login details`,
            html: emailHelper.layout({
                title: "Your account is ready",
                body: `<p style="margin:0 0 16px">Hi ${escape(name)},</p>
<p style="margin:0 0 16px">${escape(institutionName)} has created an account for you. Log in with these details:</p>
<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px">
${row("Email", escape(email))}
${row("Password", `<span style="font-family:monospace">${escape(password)}</span>`)}
</table>
<p style="margin:0 0 24px"><a href="${escape(loginUrl)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">Log in</a></p>
<p style="margin:0;font-size:13px;color:#6b7280">Or open this link: ${escape(loginUrl)}</p>`,
                footer: "Keep this password private. If you did not expect this email, contact your administrator.",
            }),
            text: `Hi ${name},

${institutionName} has created an account for you. Log in with these details:

Email: ${email}
Password: ${password}

Log in: ${loginUrl}

Keep this password private. If you did not expect this email, contact your administrator.`,
        };
    },

    // "Forgot password": a one-time link to the frontend's reset page
    passwordReset: ({name, resetUrl, minutes, institutionName}) => ({
        subject: `Reset your ${institutionName} password`,
        html: emailHelper.layout({
            title: "Reset your password",
            body: `<p style="margin:0 0 16px">Hi ${escape(name)},</p>
<p style="margin:0 0 16px">We received a request to reset your ${escape(institutionName)} password. Choose a new one with this button:</p>
<p style="margin:0 0 24px"><a href="${escape(resetUrl)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">Reset password</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#6b7280">Or open this link: ${escape(resetUrl)}</p>
<p style="margin:0">The link works once, for ${minutes} minutes.</p>`,
            footer: "If you did not ask for this, ignore this email: your password stays the same.",
        }),
        text: `Hi ${name},

We received a request to reset your ${institutionName} password. Choose a new one here:

${resetUrl}

The link works once, for ${minutes} minutes.

If you did not ask for this, ignore this email: your password stays the same.`,
    }),

    // After a change or reset, so the owner notices a change they did not make
    passwordChanged: ({name, email, institutionName}) => ({
        subject: `Your ${institutionName} password was changed`,
        html: emailHelper.layout({
            title: "Your password was changed",
            body: `<p style="margin:0 0 16px">Hi ${escape(name)},</p>
<p style="margin:0 0 16px">The password of your ${escape(institutionName)} account (${escape(email)}) was just changed, and you were logged out on your other devices.</p>
<p style="margin:0">If this was you, there is nothing to do.</p>`,
            footer: "If you did not change it, reset your password at once and contact your administrator.",
        }),
        text: `Hi ${name},

The password of your ${institutionName} account (${email}) was just changed, and you were logged out on your other devices.

If this was you, there is nothing to do. If you did not change it, reset your password at once and contact your administrator.`,
    }),
};

export default userEmails;
