-- 039: what a later "replies from students" feature (IMAP, or Google / Outlook OAuth on the institution's
-- mailbox) needs to tell which email a reply answers and keep the thread.
--
-- message_id: the email's own Message-ID header (<uuid@domain>), made by the app before the first try and
--             the same on every retry. A reply carries it in its In-Reply-To / References headers, so a
--             reply is found by it. Older emails get the Message-ID nodemailer made for them (it is what
--             provider_message_id holds).
-- from_email: the address the email was sent from (Firmli's, or the institution's own SMTP sender).
-- reply_to:   the Reply-To address (the institution's contact email), or NULL when none was set.
--             Replies land in reply_to, or in from_email without it: the mailbox to read.

ALTER TABLE application_emails
    ADD COLUMN message_id VARCHAR(255) NULL AFTER provider_message_id,
    ADD COLUMN from_email VARCHAR(255) NULL AFTER message_id,
    ADD COLUMN reply_to   VARCHAR(255) NULL AFTER from_email,
    ADD KEY idx_application_emails_message_id (tenant_id, message_id);

UPDATE application_emails SET message_id = provider_message_id WHERE message_id IS NULL AND provider_message_id LIKE '<%@%>';
