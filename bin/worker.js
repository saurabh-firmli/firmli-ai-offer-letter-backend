#!/usr/bin/env node

/**
 * A worker process only: runs queued jobs (AI assessments), no HTTP. Start more of them when the queue
 * grows; set QUEUE_WORKER=false on the API servers to keep them for requests only. Needs REDIS_URL.
 *
 *   npm run worker            (local, .env.development.local)
 *   npm run production_worker (production image: same image, this command)
 */
import config from "../src/v1/configs/env.config.js";
import logger from "../src/v1/utils/logger.util.js";
import {initDatabase, closeDatabase} from "../src/v1/utils/database.util.js";
import queueHelper from "../src/v1/helpers/queue.helper.js";
import realtimeHelper from "../src/v1/helpers/realtime.helper.js";

if (!config.queue.enabled || !config.db.enabled) {
  logger.fatal("A worker needs REDIS_URL and the database settings");
  process.exit(1);
}

await initDatabase();
// Automatic letters / emails react to the assessments this worker finishes
const {default: automationService} = await import("../src/v1/services/automation.service.js");
await automationService.startBackground({startWorker: true});
logger.info("Worker ready");

let isShuttingDown = false;
const shutdown = async (signal, exitCode = 0) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({signal}, "Worker shutting down...");
  // Running jobs may finish for up to 60 s; a job cut off is picked up again by another worker
  setTimeout(() => process.exit(1), 60_000).unref();
  await queueHelper.close();
  await realtimeHelper.close();
  await closeDatabase();
  process.exit(exitCode);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (err) => {
  logger.fatal({err}, "Unhandled promise rejection");
  shutdown("unhandledRejection", 1);
});
