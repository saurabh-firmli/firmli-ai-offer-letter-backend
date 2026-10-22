// Loaded before every test file (see the "test" script): runs the app in test mode
// without a database, whatever the developer's shell environment has set.
process.env.NODE_ENV = "test";
process.env.FIRMLI_DB_HOST = "";
process.env.LOG_LEVEL = "silent";
