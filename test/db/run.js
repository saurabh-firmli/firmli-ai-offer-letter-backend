/**
 * npm run test:db: the API tests against a real database, from a clean start every time.
 *
 *   1. runs test/db/*.flow.js, several files at once. Each file makes its own new database
 *      firmli_test_<run>_<file> on the local MySQL (from .env.development.local) with database/schema.sql,
 *      starts the app on it with a fake mail server and a fake OpenAI (no real email, no real AI call,
 *      no Redis), and drops the database when its tests end
 *   2. at the end drops whatever database of this run is left (a file that crashed) and removes the
 *      run's S3 files, whether the tests passed or not
 *
 *   npm run test:db                        every flow
 *   npm run test:db -- applications        only the files whose name contains "applications"
 *   npm run test:db -- --keep              keep the databases and S3 files afterwards, to look at the data
 *
 * Runs only against a local database and a local S3 (the Docker containers firmli-mysql and firmli-s3).
 * The database user needs rights on firmli\_test\_% once (see database/README.md).
 */
import {spawn} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import testDatabase from "./database.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1"];
const env = process.env;

const args = process.argv.slice(2);
const keep = args.includes("--keep");
const only = args.filter((arg) => !arg.startsWith("--"));

const stop = (message) => {
    console.error(`test:db: ${message}`);
    process.exit(1);
};

// Never anything but the local Docker containers
if (!LOCAL_HOSTS.includes(env.FIRMLI_DB_HOST)) stop(`FIRMLI_DB_HOST is "${env.FIRMLI_DB_HOST}"; test:db runs only against a local database`);
if (!env.S3_BUCKET || !/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(env.S3_ENDPOINT ?? "")) {
    stop("S3_ENDPOINT must be the local S3 mock (e.g. http://localhost:9100); test:db never uploads to real S3");
}

const files = (await fs.readdir(path.join(ROOT, "test/db")))
    .filter((file) => file.endsWith(".flow.js") && (!only.length || only.some((name) => file.includes(name))))
    .sort()
    .map((file) => path.join("test/db", file));
if (!files.length) stop(`no test/db/*.flow.js file matches ${only.join(", ")}`);

const run = `firmli_test_${Date.now()}`;
const s3Prefix = `${env.S3_KEY_PREFIX ?? ""}test-db/${run}/`;

const runFlows = () =>
    new Promise((resolve) => {
        const child = spawn(process.execPath, ["--test", "--test-reporter=spec", ...files], {
            cwd: ROOT,
            stdio: "inherit",
            env: {
                ...env,
                NODE_ENV: "test",
                LOG_LEVEL: env.TEST_LOG_LEVEL || "silent",
                FIRMLI_DB_POOL_MAX: "5",
                REDIS_URL: "",
                TEST_DB_RUN: run,
                TEST_DB_KEEP: keep ? "true" : "",
                S3_KEY_PREFIX: s3Prefix,
            },
        });
        // Ctrl+C reaches the tests too; the clean-up below still runs once they stop
        process.on("SIGINT", () => {});
        child.on("exit", (code) => resolve(code ?? 1));
    });

console.log(`test:db: run ${run}, ${files.length} file(s)`);
const exitCode = await runFlows();

if (keep) {
    console.log(`test:db: kept the databases ${run}_* and the S3 files under ${s3Prefix}`);
} else {
    const dropped = await testDatabase.dropAll(run).catch((error) => console.error(`test:db: could not drop the databases: ${error.message}`));
    const removed = await testDatabase.removeS3Files(s3Prefix).catch((error) => console.error(`test:db: could not remove the S3 files: ${error.message}`));
    console.log(`test:db: cleaned up${dropped?.length ? `, dropped ${dropped.join(", ")} (left by a crash)` : ""}${removed ? `, removed ${removed} S3 file(s)` : ""}`);
}
process.exit(exitCode);
