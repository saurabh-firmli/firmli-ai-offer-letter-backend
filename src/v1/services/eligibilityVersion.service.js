import _ from "lodash";
import databaseModel from "../utils/database.util.js";
import {ApiError} from "../utils/ApiError.js";
import {HTTP_RESPONSES} from "../constants/http-response-messages.constants.js";
import dbHelper from "../helpers/db.helper.js";

const NOT_FOUND = "Eligibility version not found";
const SET_NOT_FOUND = "Eligibility set not found";
export const NOT_DRAFT = "Only a draft version can be changed; create a new version first";

const VERSION_SELECT = `
    SELECT v.id, v.eligibility_set_id AS eligibilitySetId, v.version_number AS versionNumber, v.status,
           v.published_at AS publishedAt, v.created_at AS createdAt, v.updated_at AS updatedAt
    FROM eligibility_set_versions v
    JOIN eligibility_sets s ON s.id = v.eligibility_set_id
    WHERE v.deleted_at IS NULL AND s.deleted_at IS NULL`;

const CRITERION_SELECT = `
    SELECT c.id, c.version_id AS versionId, c.name, c.category_id AS categoryId, cat.label AS category,
           c.description, c.data_type AS dataType, c.operator, c.unit, c.required_value AS requiredValue,
           c.evidence_instructions AS evidenceInstructions, c.rejection_reason AS rejectionReason,
           c.is_mandatory AS isMandatory,
           DATE_FORMAT(c.effective_date, '%Y-%m-%d') AS effectiveDate,
           DATE_FORMAT(c.expiry_date, '%Y-%m-%d') AS expiryDate,
           c.sort_order AS sortOrder
    FROM eligibility_criteria c
    JOIN eligibility_categories cat ON cat.id = c.category_id
    WHERE c.deleted_at IS NULL`;

const DOCUMENT_REQUIREMENT_SELECT = `
    SELECT d.id, d.version_id AS versionId, d.document_type_id AS documentTypeId, dt.label AS documentType,
           d.custom_label AS customLabel, d.instructions, d.is_required AS isRequired, d.sort_order AS sortOrder
    FROM eligibility_document_requirements d
    JOIN document_types dt ON dt.id = d.document_type_id
    WHERE d.deleted_at IS NULL`;

// Versions belong to a set of one tenant: every lookup joins the set and checks its tenant
const eligibilityVersionService = {
    // A version with its criteria and document requirements, as the eligibility screen shows it
    getById: async (id, tenantId) => {
        const version = await eligibilityVersionService.findInTenant(id, tenantId);
        const [criteria, documentRequirements] = await Promise.all([
            eligibilityVersionService.criteriaOf(id),
            eligibilityVersionService.documentRequirementsOf(id),
        ]);
        return {...version, criteria, documentRequirements};
    },

    // "New Version": a draft copied from the published version (or the latest one if none is published)
    createDraft: async (eligibilitySetId, tenantId) => {
        await dbHelper.selectOneOrFail(
            "SELECT id FROM eligibility_sets WHERE id = :eligibilitySetId AND tenant_id = :tenantId AND deleted_at IS NULL",
            {eligibilitySetId, tenantId},
            SET_NOT_FOUND
        );

        const versions = await dbHelper.select(
            `SELECT id, version_number AS versionNumber, status FROM eligibility_set_versions
             WHERE eligibility_set_id = :eligibilitySetId AND deleted_at IS NULL`,
            {eligibilitySetId}
        );
        const draft = _.find(versions, {status: "draft"});
        if (draft) {
            throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, `Version ${draft.versionNumber} is already a draft; edit or publish it first`);
        }
        const source = _.find(versions, {status: "published"}) ?? _.maxBy(versions, "versionNumber");
        const versionNumber = await eligibilityVersionService.nextVersionNumber(eligibilitySetId);

        const created = await databaseModel.sequelize.transaction(async (transaction) => {
            const version = await databaseModel.eligibilitySetVersion.create({eligibilitySetId, versionNumber}, {transaction});
            if (source) await eligibilityVersionService.copyContents(source.id, version.id, transaction);
            return version;
        });
        return eligibilityVersionService.getById(created.id, tenantId);
    },

    // The draft becomes the published version; the one published before it is archived
    publish: async (id, tenantId) => {
        const version = await eligibilityVersionService.findDraft(id, tenantId);
        const criterion = await dbHelper.selectOne(
            "SELECT id FROM eligibility_criteria WHERE version_id = :id AND deleted_at IS NULL LIMIT 1",
            {id}
        );
        if (!criterion) throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, "Add at least one criterion before publishing");

        await databaseModel.sequelize.transaction(async (transaction) => {
            await databaseModel.eligibilitySetVersion.update(
                {status: "archived"},
                {where: {eligibilitySetId: version.eligibilitySetId, status: "published"}, transaction}
            );
            await databaseModel.eligibilitySetVersion.update({status: "published", publishedAt: new Date()}, {where: {id}, transaction});
        });
        return eligibilityVersionService.getById(id, tenantId);
    },

    // "Duplicate From": the draft's criteria and documents are replaced by a copy of another version's
    copyFrom: async (id, sourceVersionId, tenantId) => {
        await eligibilityVersionService.findDraft(id, tenantId);
        if (sourceVersionId === id) throw ApiError.validation({versionId: "Pick a different version to copy from"});
        await eligibilityVersionService.findInTenant(sourceVersionId, tenantId);

        await databaseModel.sequelize.transaction(async (transaction) => {
            await eligibilityVersionService.removeContents([id], transaction);
            await eligibilityVersionService.copyContents(sourceVersionId, id, transaction);
        });
        return eligibilityVersionService.getById(id, tenantId);
    },

    // Discards a draft with its contents; published and archived versions are kept
    remove: async (id, tenantId) => {
        await eligibilityVersionService.findDraft(id, tenantId);
        await databaseModel.sequelize.transaction(async (transaction) => {
            await eligibilityVersionService.removeContents([id], transaction);
            await databaseModel.eligibilitySetVersion.destroy({where: {id}, transaction});
        });
    },

    findInTenant: (id, tenantId) =>
        dbHelper.selectOneOrFail(`${VERSION_SELECT} AND v.id = :id AND s.tenant_id = :tenantId`, {id, tenantId}, NOT_FOUND),

    // The version, if it can still be changed
    findDraft: async (id, tenantId) => {
        const version = await eligibilityVersionService.findInTenant(id, tenantId);
        if (version.status !== "draft") throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, NOT_DRAFT);
        return version;
    },

    // Counts deleted versions too, so a version number is never given twice
    nextVersionNumber: async (eligibilitySetId) => {
        const {lastNumber} = await dbHelper.selectOne(
            "SELECT MAX(version_number) AS lastNumber FROM eligibility_set_versions WHERE eligibility_set_id = :eligibilitySetId",
            {eligibilitySetId}
        );
        return (lastNumber ?? 0) + 1;
    },

    // transaction is passed when called inside one (e.g. while copying a version)
    criteriaOf: async (versionId, transaction) => {
        const [criteria, documents] = await Promise.all([
            dbHelper.select(`${CRITERION_SELECT} AND c.version_id = :versionId ORDER BY c.sort_order, c.id`, {versionId}, {transaction}),
            dbHelper.select(
                `SELECT cd.criterion_id AS criterionId, dt.id, dt.label
                 FROM eligibility_criterion_documents cd
                 JOIN eligibility_criteria c ON c.id = cd.criterion_id
                 JOIN document_types dt ON dt.id = cd.document_type_id
                 WHERE c.version_id = :versionId AND cd.deleted_at IS NULL AND c.deleted_at IS NULL
                 ORDER BY dt.sort_order`,
                {versionId},
                {transaction}
            ),
        ]);
        const documentsByCriterion = _.groupBy(documents, "criterionId");

        return criteria.map((criterion) => {
            const criterionDocuments = documentsByCriterion[criterion.id] ?? [];
            return {
                ...criterion,
                isMandatory: Boolean(criterion.isMandatory),
                documentTypeIds: _.map(criterionDocuments, "id"),
                documentTypes: criterionDocuments.map(({id, label}) => ({id, label})),
            };
        });
    },

    documentRequirementsOf: async (versionId, transaction) => {
        const documents = await dbHelper.select(
            `${DOCUMENT_REQUIREMENT_SELECT} AND d.version_id = :versionId ORDER BY d.sort_order, d.id`,
            {versionId},
            {transaction}
        );
        return documents.map((document) => ({...document, isRequired: Boolean(document.isRequired)}));
    },

    // Copies criteria (with their documents) and document requirements into another version
    copyContents: async (fromVersionId, toVersionId, transaction) => {
        const criteria = await eligibilityVersionService.criteriaOf(fromVersionId, transaction);
        for (const criterion of criteria) {
            const columns = _.omit(criterion, ["id", "category", "documentTypeIds", "documentTypes"]);
            const copy = await databaseModel.eligibilityCriterion.create({...columns, versionId: toVersionId}, {transaction});
            await databaseModel.eligibilityCriterionDocument.bulkCreate(
                criterion.documentTypeIds.map((documentTypeId) => ({criterionId: copy.id, documentTypeId})),
                {transaction}
            );
        }

        const documents = await eligibilityVersionService.documentRequirementsOf(fromVersionId, transaction);
        await databaseModel.eligibilityDocumentRequirement.bulkCreate(
            documents.map((document) => ({..._.omit(document, ["id", "documentType"]), versionId: toVersionId})),
            {transaction}
        );
    },

    // Soft deletes the criteria (with their documents) and document requirements of these versions
    removeContents: async (versionIds, transaction) => {
        const criteria = await dbHelper.select(
            "SELECT id FROM eligibility_criteria WHERE version_id IN (:versionIds) AND deleted_at IS NULL",
            {versionIds},
            {transaction}
        );
        const criterionIds = _.map(criteria, "id");

        if (criterionIds.length) {
            await databaseModel.eligibilityCriterionDocument.destroy({where: {criterionId: criterionIds}, transaction});
            await databaseModel.eligibilityCriterion.destroy({where: {id: criterionIds}, transaction});
        }
        await databaseModel.eligibilityDocumentRequirement.destroy({where: {versionId: versionIds}, transaction});
    },
};

export default eligibilityVersionService;
