import databaseModel from "../utils/database.util.js";
import dbHelper from "../helpers/db.helper.js";
import applicationService from "./application.service.js";

const NOTE_SELECT = `
    SELECT n.id, n.review_id AS reviewId, n.note, n.created_by AS createdById, u.name AS createdByName, n.created_at AS createdAt
    FROM application_notes n
    JOIN users u ON u.id = n.created_by
    WHERE n.deleted_at IS NULL`;

// Notes on an application, from its page or from its Manual Review cases. They cannot be edited or deleted
const applicationNoteService = {
    // Newest first, the notes of every case of the application included
    listFor: async (applicationId, tenantId) => {
        await applicationService.findInTenant(applicationId, tenantId);
        const rows = await dbHelper.select(`${NOTE_SELECT} AND n.application_id = :applicationId ORDER BY n.id DESC`, {applicationId});
        return rows.map(applicationNoteService.toResponse);
    },

    // reviewId when the note is added on a Manual Review case
    create: async ({applicationId, reviewId = null}, note, user) => {
        await applicationService.findInTenant(applicationId, user.tenantId);
        const created = await databaseModel.applicationNote.create({tenantId: user.tenantId, applicationId, reviewId, note, createdBy: user.id});
        return applicationNoteService.toResponse(await dbHelper.selectOne(`${NOTE_SELECT} AND n.id = :id`, {id: created.id}));
    },

    toResponse: ({createdById, createdByName, ...row}) => ({...row, createdBy: {id: createdById, name: createdByName}}),
};

export default applicationNoteService;
