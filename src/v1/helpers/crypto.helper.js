import {createCipheriv, createDecipheriv, randomBytes} from "node:crypto";
import config from "../configs/env.config.js";
import {ApiError} from "../utils/ApiError.js";
import {HTTP_RESPONSES} from "../constants/http-response-messages.constants.js";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const key = config.encryptionKey ? Buffer.from(config.encryptionKey, "hex") : null;

/**
 * Encrypts secrets before they go into the database, e.g. a client's OpenAI key. AES-256-GCM with
 * ENCRYPTION_KEY: a changed or broken value fails to decrypt instead of giving wrong text.
 * Stored as "v1:<iv>:<tag>:<data>" (base64), so a new format can be added later.
 */
const cryptoHelper = {
    encrypt: (text) => {
        cryptoHelper.assertEnabled();
        const iv = randomBytes(12);
        const cipher = createCipheriv(ALGORITHM, key, iv);
        const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
        return [VERSION, iv, cipher.getAuthTag(), data].map((part) => (Buffer.isBuffer(part) ? part.toString("base64") : part)).join(":");
    },

    decrypt: (stored) => {
        cryptoHelper.assertEnabled();
        const [version, iv, tag, data] = stored.split(":");
        if (version !== VERSION) throw new Error(`Unknown encryption format: ${version}`);
        const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "base64"));
        decipher.setAuthTag(Buffer.from(tag, "base64"));
        return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
    },

    assertEnabled: () => {
        if (!key) throw ApiError.of(HTTP_RESPONSES.HTTP_SERVICE_UNAVAILABLE, "Encryption is not configured");
    },
};

export default cryptoHelper;
