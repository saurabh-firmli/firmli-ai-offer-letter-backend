import path from "node:path";
import {randomUUID} from "node:crypto";
import _ from "lodash";
import databaseModel from "../utils/database.util.js";
import dbHelper from "../helpers/db.helper.js";
import storageHelper from "../helpers/storage.helper.js";

const NOT_FOUND = "Document not found";

const DOCUMENT_SELECT = `
    SELECT d.id, d.document_type_id AS documentTypeId, dt.label AS documentType,
           d.original_name AS originalName, d.mime_type AS mimeType, d.size_bytes AS sizeBytes,
           d.uploaded_by AS uploadedById, u.name AS uploadedByName, d.created_at AS createdAt
    FROM application_documents d
    JOIN document_types dt ON dt.id = d.document_type_id
    LEFT JOIN users u ON u.id = d.uploaded_by
    WHERE d.deleted_at IS NULL`;

// The files of an application. Rules about the application itself (draft only, tenant) are applicationService's
const applicationDocumentService = {
    listFor: async (applicationId) =>
        (await dbHelper.select(`${DOCUMENT_SELECT} AND d.application_id = :applicationId ORDER BY d.id`, {applicationId})).map(
            applicationDocumentService.toResponse
        ),

    getById: async (id) =>
        applicationDocumentService.toResponse(await dbHelper.selectOneOrFail(`${DOCUMENT_SELECT} AND d.id = :id`, {id}, NOT_FOUND)),

    // A live document of a live application in this tenant, with what the checks and the download need
    findInTenant: (id, tenantId) =>
        dbHelper.selectOneOrFail(
            `SELECT d.id, d.application_id AS applicationId, d.original_name AS originalName, d.storage_key AS storageKey,
                    a.status AS applicationStatus
             FROM application_documents d
             JOIN applications a ON a.id = d.application_id AND a.deleted_at IS NULL
             WHERE d.id = :id AND a.tenant_id = :tenantId AND d.deleted_at IS NULL`,
            {id, tenantId},
            NOT_FOUND
        ),

    // The file goes to S3 first; if its row cannot be saved, the file is removed again
    create: async (application, documentTypeId, file, userId) => {
        const extension = path.extname(file.originalname).toLowerCase();
        const storageKey = `tenants/${application.tenantId}/applications/${application.id}/${randomUUID()}${extension}`;
        await storageHelper.save(storageKey, file.buffer, file.mimetype);
        try {
            const document = await databaseModel.applicationDocument.create({
                applicationId: application.id,
                documentTypeId,
                originalName: _.truncate(file.originalname, {length: 255}),
                storageKey,
                mimeType: file.mimetype,
                sizeBytes: file.size,
                uploadedBy: userId,
            });
            return applicationDocumentService.getById(document.id);
        } catch (error) {
            await storageHelper.remove(storageKey).catch(() => {});
            throw error;
        }
    },

    // Soft delete: the row is hidden, the file stays in S3
    remove: (id) => databaseModel.applicationDocument.destroy({where: {id}}),

    removeForApplication: (applicationId, transaction) =>
        databaseModel.applicationDocument.destroy({where: {applicationId}, transaction}),

    toResponse: ({uploadedById, uploadedByName, ...row}) => ({
        ...row,
        uploadedBy: uploadedById ? {id: uploadedById, name: uploadedByName} : null,
    }),
};

export default applicationDocumentService;
