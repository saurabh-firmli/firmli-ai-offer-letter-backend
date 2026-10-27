import {DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client} from "@aws-sdk/client-s3";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";
import config from "../configs/env.config.js";
import logger from "../utils/logger.util.js";
import {ApiError} from "../utils/ApiError.js";
import {HTTP_RESPONSES} from "../constants/http-response-messages.constants.js";

const {s3} = config;

const client = s3.enabled
    ? new S3Client({
          region: s3.region,
          ...(s3.accessKeyId ? {credentials: {accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey}} : {}),
          // MinIO and most S3-compatible servers need path-style URLs
          ...(s3.endpoint ? {endpoint: s3.endpoint, forcePathStyle: true} : {}),
      })
    : null;

/**
 * Uploaded files in S3. Keys are made by the app (never by the user) and start with S3_KEY_PREFIX.
 * The bucket stays private: a file is downloaded through a short-lived signed link that the API hands
 * out only after its own permission checks.
 */
const storageHelper = {
    save: (key, buffer, contentType) =>
        storageHelper.send(new PutObjectCommand({Bucket: s3.bucket, Key: s3.keyPrefix + key, Body: buffer, ContentType: contentType})),

    // The file's bytes, e.g. for the AI to read a document
    read: async (key) => {
        const object = await storageHelper.send(new GetObjectCommand({Bucket: s3.bucket, Key: s3.keyPrefix + key}), "read");
        return Buffer.from(await object.Body.transformToByteArray());
    },

    // Used to undo a save when the database insert fails
    remove: (key) => storageHelper.send(new DeleteObjectCommand({Bucket: s3.bucket, Key: s3.keyPrefix + key}), "removed"),

    // A link that downloads the file under its original name, valid for S3_DOWNLOAD_URL_EXPIRES_IN seconds.
    // inline: the browser shows it instead (a PDF in an iframe or tab), still under that name
    downloadUrl: async (key, fileName, {inline = false} = {}) => {
        storageHelper.assertEnabled();
        const command = new GetObjectCommand({
            Bucket: s3.bucket,
            Key: s3.keyPrefix + key,
            ResponseContentDisposition: `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        });
        return {url: await getSignedUrl(client, command, {expiresIn: s3.downloadUrlExpiresIn}), expiresIn: s3.downloadUrlExpiresIn};
    },

    // The real reason (missing bucket, wrong keys, network) goes to the logs; users get a 502 saying what failed
    send: async (command, failed = "stored") => {
        storageHelper.assertEnabled();
        try {
            return await client.send(command);
        } catch (error) {
            logger.error({err: error, bucket: s3.bucket, key: command.input?.Key}, "S3 request failed");
            throw ApiError.of(HTTP_RESPONSES.HTTP_BAD_GATEWAY, `The file could not be ${failed}, please try again`);
        }
    },

    assertEnabled: () => {
        if (!s3.enabled) throw ApiError.of(HTTP_RESPONSES.HTTP_SERVICE_UNAVAILABLE, "File storage is not configured");
    },
};

export default storageHelper;
