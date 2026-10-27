import fs from "node:fs/promises";
import mysql from "mysql2/promise";
import {DeleteObjectsCommand, ListObjectsV2Command, S3Client} from "@aws-sdk/client-s3";

// Making and removing the test databases and S3 files of npm run test:db (see run.js)
const env = process.env;
const SCHEMA = new URL("../../database/schema.sql", import.meta.url);

const connect = () =>
    mysql.createConnection({host: env.FIRMLI_DB_HOST, port: Number(env.FIRMLI_DB_PORT) || 3306, user: env.FIRMLI_DB_USER, password: env.FIRMLI_DB_PASSWORD, multipleStatements: true});

const withConnection = async (work) => {
    const connection = await connect();
    try {
        return await work(connection);
    } finally {
        await connection.end();
    }
};

// Only names test:db makes, so nothing else is ever dropped
const assertTestName = (name) => {
    if (!/^firmli_test_\w+$/.test(name)) throw new Error(`Not a test database name: ${name}`);
};

const testDatabase = {
    // A new database with database/schema.sql, plus the few places the flows use (not the full npm run seed:locations)
    create: (name) => {
        assertTestName(name);
        return withConnection(async (connection) => {
            await connection.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
            await connection.query(`USE \`${name}\``);
            await connection.query(await fs.readFile(SCHEMA, "utf8"));
            await connection.query(`
                INSERT INTO countries (id, name, iso2, phone_code, currency_code) VALUES (1, 'India', 'IN', '91', 'INR'), (2, 'Nigeria', 'NG', '234', 'NGN'), (3, 'United Kingdom', 'GB', '44', 'GBP');
                INSERT INTO states (id, country_id, name, code) VALUES (1, 1, 'Maharashtra', 'MH'), (2, 2, 'Lagos', 'LA'), (3, 3, 'England', 'ENG');
                INSERT INTO cities (id, state_id, name) VALUES (1, 1, 'Pune'), (2, 2, 'Lagos'), (3, 3, 'London');`);
        });
    },

    // Every database whose name starts with `prefix`, e.g. all of one run; answers their names
    dropAll: (prefix) => {
        assertTestName(prefix);
        return withConnection(async (connection) => {
            const [rows] = await connection.query("SELECT schema_name AS name FROM information_schema.schemata WHERE schema_name LIKE ?", [`${prefix}%`]);
            for (const {name} of rows) await connection.query(`DROP DATABASE IF EXISTS \`${name}\``);
            return rows.map((row) => row.name);
        });
    },

    // Every S3 file under `prefix`; answers how many
    removeS3Files: async (prefix) => {
        const s3 = new S3Client({
            region: env.AWS_REGION || "us-east-1",
            endpoint: env.S3_ENDPOINT,
            forcePathStyle: true,
            ...(env.AWS_ACCESS_KEY_ID ? {credentials: {accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY}} : {}),
        });
        let removed = 0;
        let token;
        do {
            const page = await s3.send(new ListObjectsV2Command({Bucket: env.S3_BUCKET, Prefix: prefix, ContinuationToken: token}));
            const keys = (page.Contents ?? []).map(({Key}) => ({Key}));
            if (keys.length) await s3.send(new DeleteObjectsCommand({Bucket: env.S3_BUCKET, Delete: {Objects: keys}}));
            removed += keys.length;
            token = page.NextContinuationToken;
        } while (token);
        return removed;
    },
};

export default testDatabase;
