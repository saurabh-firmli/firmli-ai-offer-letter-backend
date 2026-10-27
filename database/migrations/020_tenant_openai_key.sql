-- 020: each client brings its own OpenAI API key (Settings → AI Configuration).
-- The key is stored encrypted (AES-256-GCM, with ENCRYPTION_KEY from the env file), never in plain text.
-- The last 4 characters are kept apart so the page can show "sk-...abcd" without decrypting.

ALTER TABLE tenant_settings
    ADD COLUMN openai_api_key_encrypted TEXT NULL AFTER assessment_prompt,
    ADD COLUMN openai_api_key_last4 VARCHAR(4) NULL AFTER openai_api_key_encrypted;
