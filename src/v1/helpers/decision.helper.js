import databaseModel from "../utils/database.util.js";
import {APPLICATION_STATUSES, DECISION_SOURCES, NO_DECISION} from "../constants/application.constants.js";
import {CURRENT_LETTER_STATUSES, LETTER_STATUSES} from "../constants/letter.constants.js";
import eventsHelper, {EVENTS} from "./events.helper.js";

/**
 * Writes an application's decision. Whenever the decision changes, the current letter no longer fits
 * it and is marked superseded in the same transaction. Kept outside the services so the assessment,
 * applications, letters and Manual Review can all use it without importing each other.
 */
const decisionHelper = {
    // The application's current letter (waiting, approved or rejected) becomes superseded
    supersedeLetters: (applicationId, transaction) =>
        databaseModel.applicationLetter.update(
            {status: LETTER_STATUSES.SUPERSEDED},
            {where: {applicationId, status: CURRENT_LETTER_STATUSES}, transaction}
        ),

    // No decision any more (a new assessment, return for reassessment), with the new status columns
    clear: async (applicationId, columns, transaction) => {
        await databaseModel.application.update({...NO_DECISION, ...columns}, {where: {id: applicationId}, transaction});
        await decisionHelper.supersedeLetters(applicationId, transaction);
    },

    /**
     * A person's decision (Manual Review decision, Change outcome): the application is completed with the
     * outcome and reason. "application.decided" goes out once the transaction is committed.
     */
    recordManual: async (applicationId, {outcome, reason}, user, transaction) => {
        await databaseModel.application.update(
            {
                status: APPLICATION_STATUSES.COMPLETED,
                outcome,
                decisionSource: DECISION_SOURCES.MANUAL,
                decidedBy: user.id,
                decidedAt: new Date(),
                decisionReason: reason,
            },
            {where: {id: applicationId}, transaction}
        );
        await decisionHelper.supersedeLetters(applicationId, transaction);
        transaction.afterCommit(() => eventsHelper.emit(EVENTS.APPLICATION_DECIDED, {applicationId, tenantId: user.tenantId, user}));
    },
};

export default decisionHelper;
