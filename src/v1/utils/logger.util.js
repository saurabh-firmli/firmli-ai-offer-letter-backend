import pino from "pino";
import config from "../configs/env.config.js";

/**
 * Application logger. Use this instead of console.*.
 *
 * Inside a request prefer `req.log` (set by the request logger middleware): it is a child of
 * this logger that already carries the request id, so every line can be traced to its request.
 *
 * Development prints readable, coloured lines (pino-pretty); every other environment writes one
 * JSON object per line, which is what log collectors expect.
 */
const logger = pino({
    level: config.logLevel,
    base: {service: "firmli-ai-offer-letter-backend"},
    timestamp: pino.stdTimeFunctions.isoTime,
    // Never write credentials into the logs
    redact: {
        paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            'res.headers["set-cookie"]',
            "*.password",
            "*.token",
        ],
        censor: "[REDACTED]",
    },
    ...(config.isDevelopment
        ? {
              transport: {
                  target: "pino-pretty",
                  // One line per entry, prefixed with the short request id; the full req/res
                  // objects stay in the JSON output of every other environment
                  options: {
                      colorize: true,
                      translateTime: "SYS:HH:MM:ss.l",
                      ignore: "pid,hostname,service,req,res,responseTime",
                      messageFormat: "{if req.id}[{req.id}] {end}{msg}",
                  },
              },
          }
        : {}),
});

export default logger;
