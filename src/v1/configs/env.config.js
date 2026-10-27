import _ from "lodash";
import Joi from "joi";

// Checks every env value when the server starts. Use `config` in code, not process.env.
// Same sections as .env.example. An empty value means "use the default".
const envSchema = Joi.object({
    // ---- App
    NODE_ENV: Joi.string().valid("development", "test", "staging", "production").default("development"),
    PORT: Joi.number().port().default(5000),
    LOG_LEVEL: Joi.string().valid("fatal", "error", "warn", "info", "debug", "trace", "silent").default("info"),
    // Allowed sites, comma separated, or "*" for all
    CORS_ORIGINS: Joi.string().default("*"),
    // How many proxies / load balancers sit in front of the app (0 = none), e.g. 1 behind one AWS ALB.
    // Never "true": every X-Forwarded-For entry would be trusted, so anyone could fake their IP (and the login limits)
    TRUST_PROXY: Joi.string()
        .allow("")
        .default("0")
        .custom((value, helpers) => {
            const hops = ["", "false"].includes(value) ? 0 : Number(value);
            return Number.isInteger(hops) && hops >= 0 && hops <= 10 ? hops : helpers.error("trustProxy.hops");
        })
        .messages({"trustProxy.hops": "TRUST_PROXY must be the number of proxies in front of the app (0, 1, 2...), not true"}),

    // ---- Login tokens
    // Long random secret, different per environment
    JWT_SECRET: Joi.string().min(32).required(),
    // How long an access token lasts, e.g. "15m"; the refresh token (an httpOnly cookie) gets a new one
    JWT_EXPIRES_IN: Joi.string().default("15m"),
    // How long a session lasts without being used (each refresh starts the days again)
    REFRESH_TOKEN_DAYS: Joi.number().integer().min(1).max(365).empty("").default(30),
    // The refresh cookie. lax when the frontend is on the same site as the API (app.x.com / api.x.com),
    // none when on another site (needs https). Empty secure = on everywhere but development (plain http)
    COOKIE_SAME_SITE: Joi.string().valid("lax", "strict", "none").empty("").default("lax"),
    COOKIE_SECURE: Joi.boolean().empty(""),
    // e.g. ".firmli.com" to share it between subdomains; empty = the API's own host
    COOKIE_DOMAIN: Joi.string().allow("").default(""),

    // ---- Database (MySQL). Empty host = no database
    FIRMLI_DB_HOST: Joi.string().allow("").default(""),
    FIRMLI_DB_USER: Joi.string().allow("").default(""),
    FIRMLI_DB_PASSWORD: Joi.string().allow("").default(""),
    FIRMLI_DB_DATABASE: Joi.string().allow("").default(""),
    FIRMLI_DB_PORT: Joi.number().port().default(3306),
    FIRMLI_DB_DIALECT: Joi.string().valid("mysql", "mariadb", "postgres").default("mysql"),
    FIRMLI_DB_POOL_MAX: Joi.number().integer().min(2).max(100).default(10),

    // ---- Frontend
    // Used for links in emails
    FRONTEND_URL: Joi.string().uri().empty("").default("http://localhost:3005"),

    // ---- File storage (S3). Empty bucket = uploads are off
    S3_BUCKET: Joi.string().allow("").default(""),
    AWS_REGION: Joi.string().empty("").default("ap-south-1"),
    // Empty on AWS servers with an IAM role
    AWS_ACCESS_KEY_ID: Joi.string().allow("").default(""),
    AWS_SECRET_ACCESS_KEY: Joi.string().allow("").default(""),
    // Only for MinIO / S3-compatible storage; empty for AWS
    S3_ENDPOINT: Joi.string().uri().allow("").default(""),
    // Folder for this environment, e.g. "staging/"
    S3_KEY_PREFIX: Joi.string().allow("").default(""),
    // Download link life, in seconds
    S3_DOWNLOAD_URL_EXPIRES_IN: Joi.number().integer().min(30).max(3600).empty("").default(300),

    // ---- Job queue (Redis, BullMQ). Empty URL = jobs run inside the API process, without a queue
    // e.g. redis://localhost:6379/1 (the /1 is the Redis database number)
    REDIS_URL: Joi.string().uri({scheme: ["redis", "rediss"]}).allow("").default(""),
    // Keeps this app's keys apart in a shared Redis, e.g. "firmli-staging"
    QUEUE_PREFIX: Joi.string().empty("").default("firmli"),
    // AI assessments one worker process runs at the same time
    QUEUE_CONCURRENCY: Joi.number().integer().min(1).max(50).empty("").default(3),
    // false = this API process only adds jobs; separate `npm run worker` processes run them
    QUEUE_WORKER: Joi.boolean().empty("").default(true),

    // ---- Email (SMTP). Empty host = email is off
    SMTP_HOST: Joi.string().allow("").default(""),
    SMTP_PORT: Joi.number().port().empty("").default(587),
    // true for port 465, false for 587
    SMTP_SECURE: Joi.boolean().empty("").default(false),
    SMTP_USER: Joi.string().allow("").default(""),
    SMTP_PASSWORD: Joi.string().allow("").default(""),
    // Sender name and address
    MAIL_FROM: Joi.string().empty("").default("Firmli <no-reply@firmli.com>"),

    // ---- AI
    // Empty = OpenAI itself; npm run test:db points it to a fake server
    OPENAI_BASE_URL: Joi.string().uri().empty("").default("https://api.openai.com/v1"),

    // ---- Encryption
    // Locks secrets saved in the database (e.g. each client's OpenAI key). 64 hex characters.
    // Never change it once keys are saved, or they can't be read
    ENCRYPTION_KEY: Joi.string()
        .hex()
        .length(64)
        .allow("")
        .default("")
        .messages({"string.length": "ENCRYPTION_KEY must be 64 hex characters", "string.hex": "ENCRYPTION_KEY must be 64 hex characters"}),
}).unknown(true);

const {error, value: env} = envSchema.validate(process.env, {abortEarly: false});

if (error) {
    throw new Error(`Invalid environment configuration: ${error.message}`);
}
// Browsers drop a SameSite=None cookie that is not Secure
if (env.COOKIE_SAME_SITE === "none" && env.COOKIE_SECURE === false) {
    throw new Error("Invalid environment configuration: COOKIE_SAME_SITE=none needs COOKIE_SECURE=true (https)");
}

const corsOrigins = _.compact(env.CORS_ORIGINS.split(",").map((origin) => origin.trim()));

const config = Object.freeze({
    // App
    env: env.NODE_ENV,
    isDevelopment: env.NODE_ENV === "development",
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    cors: {
        allowAnyOrigin: corsOrigins.includes("*"),
        origins: corsOrigins,
    },
    // A hop count: the client's IP is the address that many proxies back in X-Forwarded-For
    trustProxy: Number(env.TRUST_PROXY),

    // Login tokens
    jwt: {
        secret: env.JWT_SECRET,
        expiresIn: env.JWT_EXPIRES_IN,
    },

    // Refresh tokens: the session cookie
    session: {
        refreshDays: env.REFRESH_TOKEN_DAYS,
        cookie: {
            sameSite: env.COOKIE_SAME_SITE,
            secure: env.COOKIE_SECURE ?? env.NODE_ENV !== "development",
            domain: env.COOKIE_DOMAIN || undefined,
        },
    },

    // Database
    db: {
        enabled: Boolean(env.FIRMLI_DB_HOST),
        host: env.FIRMLI_DB_HOST,
        user: env.FIRMLI_DB_USER,
        password: env.FIRMLI_DB_PASSWORD,
        database: env.FIRMLI_DB_DATABASE,
        port: env.FIRMLI_DB_PORT,
        dialect: env.FIRMLI_DB_DIALECT,
        poolMax: env.FIRMLI_DB_POOL_MAX,
    },

    // Frontend
    frontendUrl: env.FRONTEND_URL.replace(/\/+$/, ""),

    // File storage (S3)
    s3: {
        enabled: Boolean(env.S3_BUCKET),
        bucket: env.S3_BUCKET,
        region: env.AWS_REGION,
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        endpoint: env.S3_ENDPOINT,
        keyPrefix: env.S3_KEY_PREFIX,
        downloadUrlExpiresIn: env.S3_DOWNLOAD_URL_EXPIRES_IN,
    },

    // Email (SMTP)
    mail: {
        enabled: Boolean(env.SMTP_HOST),
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        user: env.SMTP_USER,
        password: env.SMTP_PASSWORD,
        from: env.MAIL_FROM,
    },

    // AI
    openaiBaseUrl: env.OPENAI_BASE_URL.replace(/\/+$/, ""),

    // Encryption
    encryptionKey: env.ENCRYPTION_KEY,

    // Job queue
    queue: {
        enabled: Boolean(env.REDIS_URL),
        redisUrl: env.REDIS_URL,
        prefix: env.QUEUE_PREFIX,
        concurrency: env.QUEUE_CONCURRENCY,
        worker: env.QUEUE_WORKER,
    },
});

export default config;
