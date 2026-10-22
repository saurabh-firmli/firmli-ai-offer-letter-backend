import Joi from "joi";

// All env vars are validated here at boot; the rest of the app reads `config`, not process.env
const envSchema = Joi.object({
    NODE_ENV: Joi.string().valid("development", "staging", "production", "test").default("development"),
    PORT: Joi.number().port().default(3000),
    LOG_LEVEL: Joi.string().valid("fatal", "error", "warn", "info", "debug", "trace", "silent").default("info"),
    // Comma separated list of allowed origins, or "*" for any origin (without cookies)
    CORS_ORIGINS: Joi.string().default("*"),
    // true when running behind a load balancer / reverse proxy
    TRUST_PROXY: Joi.boolean().default(false),

    // Leave FIRMLI_DB_HOST empty to boot without a database
    FIRMLI_DB_HOST: Joi.string().allow("").default(""),
    FIRMLI_DB_USER: Joi.string().allow("").default(""),
    FIRMLI_DB_PASSWORD: Joi.string().allow("").default(""),
    FIRMLI_DB_DATABASE: Joi.string().allow("").default(""),
    FIRMLI_DB_PORT: Joi.number().port().default(3306),
    FIRMLI_DB_DIALECT: Joi.string().valid("mysql", "mariadb", "postgres").default("mysql"),
}).unknown(true);

const {error, value: env} = envSchema.validate(process.env, {abortEarly: false});

if (error) {
    throw new Error(`Invalid environment configuration: ${error.message}`);
}

const corsOrigins = env.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);

const config = Object.freeze({
    env: env.NODE_ENV,
    isDevelopment: env.NODE_ENV === "development",
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    cors: {
        allowAnyOrigin: corsOrigins.includes("*"),
        origins: corsOrigins,
    },
    trustProxy: env.TRUST_PROXY,
    db: {
        enabled: Boolean(env.FIRMLI_DB_HOST),
        host: env.FIRMLI_DB_HOST,
        user: env.FIRMLI_DB_USER,
        password: env.FIRMLI_DB_PASSWORD,
        database: env.FIRMLI_DB_DATABASE,
        port: env.FIRMLI_DB_PORT,
        dialect: env.FIRMLI_DB_DIALECT,
    },
});

export default config;
