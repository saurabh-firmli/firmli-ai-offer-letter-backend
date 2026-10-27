// Loaded before every test file (see the "test" script): runs the app in test mode without a database,
// whatever the developer's shell or env files have set.
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
process.env.FIRMLI_DB_HOST = "";
process.env.S3_BUCKET = "";
process.env.SMTP_HOST = "";
process.env.REDIS_URL = "";
process.env.JWT_SECRET = "test-secret-that-is-at-least-32-characters-long";
process.env.ENCRYPTION_KEY = "0".repeat(64);
