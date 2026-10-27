import emailHelper from "../helpers/email.helper.js";

const {escape} = emailHelper;

// Emails to students about their application. Each returns {subject, html, text} for emailHelper.send
const applicationEmails = {
    // "Request documents" from the Manual Review Queue
    documentsRequested: ({studentName, applicationNumber, programName, institutionName, documents, message, brand}) => ({
        subject: `${institutionName}: documents needed for application ${applicationNumber}`,
        html: emailHelper.layout({
            title: "We need a few more documents",
            body: `<p style="margin:0 0 16px">Hi ${escape(studentName)},</p>
<p style="margin:0 0 16px">To continue reviewing your application <strong>${escape(applicationNumber)}</strong> for
<strong>${escape(programName)}</strong>, please send us:</p>
<ul style="margin:0 0 16px;padding-left:20px">${documents.map((document) => `<li style="margin:0 0 6px">${escape(document)}</li>`).join("")}</ul>
${message ? `<p style="margin:0 0 16px;white-space:pre-line">${escape(message)}</p>` : ""}
<p style="margin:0">Reply to this email with the documents attached, or contact the admissions team.</p>`,
            brand,
        }),
        text: `Hi ${studentName},

To continue reviewing your application ${applicationNumber} for ${programName}, please send us:

${documents.map((document) => `- ${document}`).join("\n")}
${message ? `\n${message}\n` : ""}
Reply to this email with the documents attached, or contact the admissions team.

${institutionName} admissions`,
    }),
};

export default applicationEmails;
