import logger from "../utils/logger.util.js";
import eventsHelper, {EVENTS} from "../helpers/events.helper.js";
import {RETRY_CHECK_SECONDS} from "../constants/communication.constants.js";
import assessmentService from "./assessment.service.js";
import letterService from "./letter.service.js";
import communicationService from "./communication.service.js";
import settingsService from "./settings.service.js";

/**
 * Settings > Automation: "Automatic letter generation" makes the letter once an application is decided
 * (by the AI or a person); "Automatic email dispatch" emails it once it is approved (by Settings or a
 * person). Something that cannot be done automatically (no template, a draft template, ...) is logged
 * and left for a person: the application shows it has no letter / no email yet.
 */
const automationService = {
    /**
     * At startup of the API and of worker processes: AI assessments through the queue (a worker here
     * when startWorker, by default unless QUEUE_WORKER=false), runs left in progress by the last shutdown,
     * then automatic letters / emails and the email retry loop.
     */
    startBackground: async ({startWorker} = {}) => {
        assessmentService.registerWorker({startWorker});
        await assessmentService.recoverInterrupted();
        await automationService.start();
    },

    start: async () => {
        eventsHelper.on(EVENTS.APPLICATION_DECIDED, automationService.onDecided);
        eventsHelper.on(EVENTS.LETTER_APPROVED, automationService.onLetterApproved);
        await communicationService.recoverInterrupted();
        setInterval(
            () =>
                communicationService
                    .recoverInterrupted()
                    .then(communicationService.retryDue)
                    .catch((error) => logger.error({err: error}, "Email retries failed")),
            RETRY_CHECK_SECONDS * 1000
        ).unref();
    },

    onDecided: async ({applicationId, tenantId, user}) => {
        if (!(await settingsService.flags(tenantId)).autoLetterGeneration) return;
        try {
            await letterService.generate(applicationId, {...user, tenantId});
        } catch (error) {
            logger.warn({applicationId, reason: error.message}, "Automatic letter not generated");
        }
    },

    onLetterApproved: async ({letterId, tenantId, user}) => {
        if (!(await settingsService.flags(tenantId)).autoEmailDispatch) return;
        try {
            await communicationService.sendLetter(letterId, {}, {...user, tenantId});
        } catch (error) {
            logger.warn({letterId, reason: error.message}, "Automatic email not sent");
        }
    },
};

export default automationService;
