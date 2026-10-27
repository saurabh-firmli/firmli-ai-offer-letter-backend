import {Queue, Worker} from "bullmq";
import IORedis from "ioredis";
import config from "../configs/env.config.js";
import logger from "../utils/logger.util.js";

const {queue: settings} = config;

// One connection for adding jobs; BullMQ opens its own extra ones for workers.
// maxRetriesPerRequest null: a worker waits for Redis to come back instead of giving up
const connection = settings.enabled ? new IORedis(settings.redisUrl, {maxRetriesPerRequest: null}) : null;
const queues = {};
const workers = [];
const handlers = {};

/**
 * Background jobs. With REDIS_URL they go through BullMQ: kept in Redis, run by workers at most
 * QUEUE_CONCURRENCY at a time, retried with growing waits, and picked up again after a crash. Without
 * it they run inside this process right away (local tests), once, with no retry.
 *
 *   queueHelper.process("assessment", async (data, {isLastAttempt}) => ...);
 *   await queueHelper.add("assessment", "assessment-41", {assessmentId: 41}, {attempts: 3, backoffMs: 30_000});
 *
 * A handler throws to be retried.
 */
const queueHelper = {
    enabled: settings.enabled,

    // A job with the same jobId that is waiting or running is not added twice; a finished one is replaced
    add: async (name, jobId, data, {attempts = 1, backoffMs = 30_000} = {}) => {
        if (!settings.enabled) {
            setImmediate(() =>
                Promise.resolve(handlers[name](data, {isLastAttempt: true})).catch((error) => logger.error({err: error, name, jobId}, "Job failed"))
            );
            return;
        }
        const queue = queueHelper.queue(name);
        const existing = await queue.getJob(jobId);
        if (existing && ["completed", "failed"].includes(await existing.getState())) await existing.remove();
        await queue.add(name, data, {
            jobId,
            attempts,
            backoff: {type: "exponential", delay: backoffMs},
            removeOnComplete: 1000,
            removeOnFail: 5000,
        });
    },

    // Registers what runs a job; starts a worker here unless this process only adds jobs
    process: (name, handler, {startWorker = settings.worker} = {}) => {
        handlers[name] = handler;
        if (!settings.enabled || !startWorker) return;
        const worker = new Worker(name, (job) => handler(job.data, {isLastAttempt: job.attemptsMade + 1 >= (job.opts.attempts ?? 1)}), {
            connection,
            prefix: settings.prefix,
            concurrency: settings.concurrency,
        });
        worker.on("failed", (job, error) => logger.warn({name, jobId: job?.id, attempt: job?.attemptsMade, reason: error.message}, "Job attempt failed"));
        worker.on("error", (error) => logger.error({err: error, name}, "Queue worker error"));
        workers.push(worker);
        logger.info({name, concurrency: settings.concurrency}, "Queue worker started");
    },

    queue: (name) => (queues[name] ??= new Queue(name, {connection, prefix: settings.prefix})),

    // For the health check: "up", "down" or "not_configured"
    status: async () => {
        if (!settings.enabled) return "not_configured";
        try {
            return (await connection.ping()) === "PONG" ? "up" : "down";
        } catch {
            return "down";
        }
    },

    // On shutdown: running jobs finish first (a job cut off is retried by another worker)
    close: async () => {
        await Promise.all(workers.map((worker) => worker.close()));
        await Promise.all(Object.values(queues).map((queue) => queue.close()));
        if (connection) await connection.quit().catch(() => {});
    },
};

export default queueHelper;
