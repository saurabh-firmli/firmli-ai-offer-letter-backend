import emailHelper from "../helpers/email.helper.js";

const {escape} = emailHelper;

// Emails about the Settings page. Each returns {subject, html, text} for emailHelper.send
const settingsEmails = {
    // "Send test email": proves the email setup works
    test: ({institutionName}) => ({
        subject: `${institutionName}: test email`,
        html: emailHelper.layout({
            title: "Your email setup works",
            body: `<p style="margin:0">This is a test email from ${escape(institutionName)}. If you can read it, emails to students will be delivered.</p>`,
        }),
        text: `This is a test email from ${institutionName}. If you can read it, emails to students will be delivered.`,
    }),
};

export default settingsEmails;
