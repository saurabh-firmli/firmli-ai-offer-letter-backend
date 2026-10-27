import {randomUUID} from "node:crypto";
import pinoHttp from "pino-http";
import logger from "../utils/logger.util.js";

// An events ticket rides in the URL (EventSource cannot send headers): keep it out of the logs
const maskTicket = (url) => url.replace(/([?&]ticket=)[^&]*/, "$1***");

// Logs one line per request and gives it an id: req.id, the X-Request-Id header, and req.log
const requestLogger = pinoHttp({
    logger,
    genReqId: (req, res) => {
        const requestId = randomUUID();
        res.setHeader("X-Request-Id", requestId);
        return requestId;
    },
    customLogLevel: (req, res, err) => {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
    },
    customSuccessMessage: (req, res, responseTime) =>
        `${req.method} ${maskTicket(req.originalUrl)} ${res.statusCode} ${Math.round(responseTime)}ms`,
    customErrorMessage: (req, res, err) =>
        `${req.method} ${maskTicket(req.originalUrl)} ${res.statusCode} ${err.message}`,
    serializers: {
        req: (req) => ({id: req.id, method: req.method, url: maskTicket(req.url)}),
        res: (res) => ({statusCode: res.statusCode}),
    },
});

export default requestLogger;
