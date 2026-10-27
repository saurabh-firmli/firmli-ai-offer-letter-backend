-- 038: phone numbers in E.164 (+919876543210), as the API now saves them.
--
-- students.phone and tenants.phone keep only digits and +, and a leading 00 becomes +. A number saved
-- without its country code (e.g. 9876543210) stays as it is: the country cannot be guessed safely, so it
-- is fixed when the record is next edited (the API then asks for the country code). Find them with
--     SELECT id, phone FROM students WHERE phone NOT LIKE '+%';
-- No column change: VARCHAR(30) holds the at most 16 characters of E.164.

UPDATE students SET phone = REGEXP_REPLACE(REGEXP_REPLACE(phone, '[^0-9+]', ''), '^00', '+') WHERE phone IS NOT NULL;
UPDATE students SET phone = NULL WHERE phone = '';

UPDATE tenants SET phone = REGEXP_REPLACE(REGEXP_REPLACE(phone, '[^0-9+]', ''), '^00', '+') WHERE phone IS NOT NULL;
UPDATE tenants SET phone = NULL WHERE phone = '';
