import {EventEmitter} from "node:events";
import logger from "../utils/logger.util.js";

/**
 * In-process events, so a service can say what happened without knowing who reacts (and without
 * import cycles): e.g. the assessment says an application was decided, automation generates its letter.
 * Listeners run after the current request's work, with the same request context (user, request id).
 *
 *   eventsHelper.emit(EVENTS.APPLICATION_DECIDED, {applicationId, tenantId, user});
 *   eventsHelper.on(EVENTS.APPLICATION_DECIDED, async ({applicationId}) => ...);
 */
export const EVENTS = {
    APPLICATION_DECIDED: "application.decided",
    LETTER_APPROVED: "letter.approved",
};

const emitter = new EventEmitter();

const eventsHelper = {
    emit: (event, payload) => emitter.emit(event, payload),

    // The listener runs on the next tick; its errors are logged, never thrown back to the emitter
    on: (event, listener) =>
        emitter.on(event, (payload) =>
            setImmediate(() => Promise.resolve(listener(payload)).catch((error) => logger.error({err: error, event, payload}, "Event listener failed")))
        ),
};

export default eventsHelper;
