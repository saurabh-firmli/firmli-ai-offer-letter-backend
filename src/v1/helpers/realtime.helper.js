import {EventEmitter} from "node:events";
import IORedis from "ioredis";
import config from "../configs/env.config.js";
import logger from "../utils/logger.util.js";
import {MODULES} from "../constants/module.constants.js";

const {queue: settings} = config;
const CHANNEL = `${settings.prefix}:events`;
// A comment line now and then keeps proxies and load balancers from closing an idle stream
const HEARTBEAT_MS = 25_000;

// Who may receive each kind of event: the module the user needs read on
const REALTIME_EVENTS = {
    "assessment.updated": MODULES.APPLICATIONS,
    "review.updated": MODULES.REVIEWS,
    "letter.updated": MODULES.LETTERS,
    "email.updated": MODULES.COMMUNICATIONS,
};

// With Redis every process (API and workers) shares the events; without it they stay in this process
const local = new EventEmitter();
const publisher = settings.enabled ? new IORedis(settings.redisUrl, {maxRetriesPerRequest: null, lazyConnect: true}) : null;
let subscriber = null;
const clients = new Set();

/**
 * Live updates for the browser (Server-Sent Events): a service publishes what changed, and every open
 * stream of that tenant whose user may read the module gets it. Events carry ids and statuses only;
 * the page fetches the details itself, with its normal permissions.
 *
 *   realtimeHelper.publish(tenantId, "assessment.updated", {applicationId: 85, assessmentId: 41, status: "completed"});
 */
const realtimeHelper = {
    // Never fails the caller: a lost live update only means the page refreshes a bit later
    publish: (tenantId, type, data) => {
        const message = JSON.stringify({tenantId, type, data});
        if (!publisher) {
            local.emit("message", message);
            return;
        }
        publisher.publish(CHANNEL, message).catch((error) => logger.warn({err: error, type}, "Live update not published"));
    },

    // An open stream for this user: answers headers now, then one "event:" block per update
    open: (req, res, user) => {
        res.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            // nginx and similar proxies must not buffer the stream
            "X-Accel-Buffering": "no",
        });
        res.write(`retry: 5000\nevent: ready\ndata: ${JSON.stringify({userId: user.id})}\n\n`);

        const client = {res, user};
        clients.add(client);
        realtimeHelper.listen();
        const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
        req.on("close", () => {
            clearInterval(heartbeat);
            clients.delete(client);
        });
    },

    // Starts receiving events in this process, once (only API processes with open streams need it)
    listen: () => {
        if (!publisher) {
            if (!local.listenerCount("message")) local.on("message", realtimeHelper.deliver);
            return;
        }
        if (subscriber) return;
        subscriber = publisher.duplicate();
        subscriber.on("message", (channel, message) => realtimeHelper.deliver(message));
        subscriber.subscribe(CHANNEL).catch((error) => logger.error({err: error}, "Live updates: could not subscribe"));
    },

    deliver: (message) => {
        const {tenantId, type, data} = JSON.parse(message);
        const module = REALTIME_EVENTS[type];
        for (const {res, user} of clients) {
            if (user.tenantId !== tenantId || !user.permissions[module]?.read) continue;
            res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
        }
    },

    // On shutdown: open streams would keep the server from closing; the browser reconnects to another one
    close: async () => {
        for (const {res} of clients) res.end();
        clients.clear();
        if (subscriber) await subscriber.quit().catch(() => {});
        if (publisher) await publisher.quit().catch(() => {});
    },
};

export default realtimeHelper;
