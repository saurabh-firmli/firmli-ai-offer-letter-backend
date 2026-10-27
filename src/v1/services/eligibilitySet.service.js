import _ from "lodash";
import {Op} from "sequelize";
import databaseModel from "../utils/database.util.js";
import {ApiError} from "../utils/ApiError.js";
import dbHelper from "../helpers/db.helper.js";
import eligibilityVersionService from "./eligibilityVersion.service.js";

const NOT_FOUND = "Eligibility set not found";
const DUPLICATE_NAME = "An eligibility set with this name already exists";
const IN_USE = "Eligibility set is assigned to programs; unassign them first";

// The version numbers tell the list which version is live and whether a draft is in progress
const SET_SELECT = `
    SELECT s.id, s.tenant_id AS tenantId, s.name, s.description,
           (SELECT MAX(v.version_number) FROM eligibility_set_versions v
            WHERE v.eligibility_set_id = s.id AND v.status = 'published' AND v.deleted_at IS NULL) AS publishedVersion,
           (SELECT MAX(v.version_number) FROM eligibility_set_versions v
            WHERE v.eligibility_set_id = s.id AND v.status = 'draft' AND v.deleted_at IS NULL) AS draftVersion,
           (SELECT COUNT(*) FROM programs p WHERE p.eligibility_set_id = s.id AND p.deleted_at IS NULL) AS programCount,
           s.created_at AS createdAt, s.updated_at AS updatedAt
    FROM eligibility_sets s
    WHERE s.deleted_at IS NULL`;

// Every method works inside one tenant (tenantId comes from req.user)
const eligibilitySetService = {
    list: ({search}, tenantId) =>
        dbHelper.select(`${SET_SELECT} AND s.tenant_id = :tenantId ${search ? "AND s.name LIKE :search" : ""} ORDER BY s.name`, {
            tenantId,
            search: search && dbHelper.likePattern(search),
        }),

    // The set with its versions (newest first) and the programs it is assigned to
    getById: async (id, tenantId) => {
        const set = await eligibilitySetService.findInTenant(id, tenantId);
        const [versions, programs] = await Promise.all([
            dbHelper.select(
                `SELECT v.id, v.version_number AS versionNumber, v.status, v.published_at AS publishedAt,
                        (SELECT COUNT(*) FROM eligibility_criteria c WHERE c.version_id = v.id AND c.deleted_at IS NULL) AS criteriaCount
                 FROM eligibility_set_versions v
                 WHERE v.eligibility_set_id = :id AND v.deleted_at IS NULL
                 ORDER BY v.version_number DESC`,
                {id}
            ),
            dbHelper.select(
                "SELECT id, name, code FROM programs WHERE eligibility_set_id = :id AND deleted_at IS NULL ORDER BY name",
                {id}
            ),
        ]);
        return {...set, versions, programs};
    },

    // A new set starts with an empty draft, version 1
    create: async (values, tenantId) => {
        const set = await dbHelper.saveOrConflict(
            () =>
                databaseModel.sequelize.transaction(async (transaction) => {
                    const created = await databaseModel.eligibilitySet.create(
                        {...dbHelper.emptyToNull(values), tenantId},
                        {transaction}
                    );
                    await databaseModel.eligibilitySetVersion.create({eligibilitySetId: created.id, versionNumber: 1}, {transaction});
                    return created;
                }),
            DUPLICATE_NAME
        );
        return eligibilitySetService.getById(set.id, tenantId);
    },

    // Only this tenant's live row is updated; reading it back answers 404 when there was none
    update: async (id, values, tenantId) => {
        await dbHelper.saveOrConflict(
            () => databaseModel.eligibilitySet.update(dbHelper.emptyToNull(values), {where: {id, tenantId}}),
            DUPLICATE_NAME
        );
        return eligibilitySetService.getById(id, tenantId);
    },

    // Soft deletes the set with all its versions, criteria and document requirements
    remove: async (id, tenantId) => {
        await eligibilitySetService.findInTenant(id, tenantId);
        await dbHelper.assertUnused(
            "SELECT id FROM programs WHERE eligibility_set_id = :id AND deleted_at IS NULL LIMIT 1",
            {id},
            IN_USE
        );

        const versions = await dbHelper.select(
            "SELECT id FROM eligibility_set_versions WHERE eligibility_set_id = :id AND deleted_at IS NULL",
            {id}
        );
        const versionIds = _.map(versions, "id");

        await databaseModel.sequelize.transaction(async (transaction) => {
            if (versionIds.length) {
                await eligibilityVersionService.removeContents(versionIds, transaction);
                await databaseModel.eligibilitySetVersion.destroy({where: {id: versionIds}, transaction});
            }
            await databaseModel.eligibilitySet.destroy({where: {id, tenantId}, transaction});
        });
    },

    /**
     * Makes programIds exactly the programs using this set: the listed ones get it (moving off any
     * other set), the ones no longer listed are left without a set. An empty list unassigns all.
     */
    assignPrograms: async (id, programIds, tenantId) => {
        await eligibilitySetService.findInTenant(id, tenantId);
        await eligibilitySetService.assertProgramsInTenant(programIds, tenantId);

        await databaseModel.sequelize.transaction(async (transaction) => {
            const noLongerListed = programIds.length ? {id: {[Op.notIn]: programIds}} : {};
            await databaseModel.program.update(
                {eligibilitySetId: null},
                {where: {tenantId, eligibilitySetId: id, ...noLongerListed}, transaction}
            );
            if (programIds.length) {
                await databaseModel.program.update({eligibilitySetId: id}, {where: {tenantId, id: programIds}, transaction});
            }
        });
        return eligibilitySetService.getById(id, tenantId);
    },

    findInTenant: (id, tenantId) =>
        dbHelper.selectOneOrFail(`${SET_SELECT} AND s.id = :id AND s.tenant_id = :tenantId`, {id, tenantId}, NOT_FOUND),

    assertProgramsInTenant: async (programIds, tenantId) => {
        if (_.isEmpty(programIds)) return;
        const found = await dbHelper.select(
            "SELECT id FROM programs WHERE tenant_id = :tenantId AND id IN (:programIds) AND deleted_at IS NULL",
            {tenantId, programIds}
        );
        const missing = _.difference(programIds, _.map(found, "id"));
        if (missing.length) throw ApiError.validation({programIds: `Programs not found: ${missing.join(", ")}`});
    },
};

export default eligibilitySetService;
