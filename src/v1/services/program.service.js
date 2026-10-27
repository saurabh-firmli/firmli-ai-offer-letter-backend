import _ from "lodash";
import databaseModel from "../utils/database.util.js";
import {ApiError} from "../utils/ApiError.js";
import {HTTP_RESPONSES} from "../constants/http-response-messages.constants.js";
import dbHelper from "../helpers/db.helper.js";
import locationService from "./location.service.js";
import letterTemplateService from "./letterTemplate.service.js";
import emailTemplateService from "./emailTemplate.service.js";

const NOT_FOUND = "Program not found";
const DUPLICATE_CODE = "Program code already exists";

const PROGRAM_SELECT = `
    SELECT p.id, p.tenant_id AS tenantId, p.name, p.code, p.award_level AS awardLevel, p.campus_id AS campusId,
           p.eligibility_set_id AS eligibilitySetId, es.name AS eligibilitySetName,
           (SELECT MAX(v.version_number) FROM eligibility_set_versions v
            WHERE v.eligibility_set_id = p.eligibility_set_id AND v.status = 'published' AND v.deleted_at IS NULL) AS eligibilityPublishedVersion,
           p.duration, p.study_mode AS studyMode,
           DATE_FORMAT(p.application_deadline, '%Y-%m-%d') AS applicationDeadline,
           p.status, p.description,
           p.conditional_offer_template_id AS conditionalOfferTemplateId,
           p.rejection_template_id AS rejectionTemplateId,
           p.manual_review_template_id AS manualReviewTemplateId,
           p.offer_email_template_id AS offerEmailTemplateId,
           p.rejection_email_template_id AS rejectionEmailTemplateId,
           p.created_at AS createdAt, p.updated_at AS updatedAt,
           c.name AS campusName, ci.name AS campusCity, st.name AS campusState, co.name AS campusCountry
    FROM programs p
    LEFT JOIN campuses c ON c.id = p.campus_id
    LEFT JOIN eligibility_sets es ON es.id = p.eligibility_set_id
    ${locationService.joinLocation("c.city_id")}`;

const JOINED_COLUMNS = ["campusName", "campusCity", "campusState", "campusCountry", "eligibilitySetName", "eligibilityPublishedVersion"];

// Every method works inside one tenant (tenantId comes from req.user)
const programService = {
    list: ({page, limit, ...filters}, tenantId) => {
        const {status, studyMode, campusId, eligibilitySetId, search} = filters;
        const conditions = ["p.tenant_id = :tenantId", "p.deleted_at IS NULL"];
        if (status) conditions.push("p.status = :status");
        if (studyMode) conditions.push("p.study_mode = :studyMode");
        if (campusId) conditions.push("p.campus_id = :campusId");
        if (eligibilitySetId) conditions.push("p.eligibility_set_id = :eligibilitySetId");
        if (search) conditions.push("(p.name LIKE :search OR p.code LIKE :search)");

        const where = `WHERE ${conditions.join(" AND ")}`;
        return dbHelper.paginate({
            countSql: `SELECT COUNT(*) AS total FROM programs p ${where}`,
            rowsSql: `${PROGRAM_SELECT} ${where} ORDER BY p.id DESC LIMIT :limit OFFSET :offset`,
            replacements: {...filters, tenantId, search: search && dbHelper.likePattern(search)},
            page,
            limit,
            mapRow: programService.toResponse,
        });
    },

    getById: async (id, tenantId) => {
        const row = await dbHelper.selectOneOrFail(
            `${PROGRAM_SELECT} WHERE p.id = :id AND p.tenant_id = :tenantId AND p.deleted_at IS NULL`,
            {id, tenantId},
            NOT_FOUND
        );
        return programService.toResponse(row);
    },

    create: async (values, tenantId) => {
        const columns = dbHelper.emptyToNull(values);
        await programService.assertLinksInTenant(columns, tenantId);
        const program = await dbHelper.saveOrConflict(() => databaseModel.program.create({...columns, tenantId}), DUPLICATE_CODE);
        return programService.getById(program.id, tenantId);
    },

    // Only this tenant's live row is updated; reading it back answers 404 when there was none
    update: async (id, values, tenantId) => {
        const columns = dbHelper.emptyToNull(values);
        await programService.assertLinksInTenant(columns, tenantId);
        await dbHelper.saveOrConflict(() => databaseModel.program.update(columns, {where: {id, tenantId}}), DUPLICATE_CODE);
        return programService.getById(id, tenantId);
    },

    // Soft delete: its code can be used again, and its campus, set and templates are no longer "in use" by it
    remove: async (id, tenantId) => {
        const deleted = await databaseModel.program.destroy({where: {id, tenantId}});
        if (!deleted) throw ApiError.of(HTTP_RESPONSES.HTTP_NOT_FOUND, NOT_FOUND);
    },

    // The foreign keys alone would accept another tenant's (or a deleted) campus, eligibility set or template
    assertLinksInTenant: async (columns, tenantId) => {
        await programService.assertInTenant("campuses", columns.campusId, tenantId, {campusId: "Campus not found"});
        await programService.assertInTenant("eligibility_sets", columns.eligibilitySetId, tenantId, {
            eligibilitySetId: "Eligibility set not found",
        });
        await letterTemplateService.assertProgramTemplates(columns, tenantId);
        await emailTemplateService.assertProgramTemplates(columns, tenantId);
    },

    // table is a constant from this file, never user input; no id sent means nothing to check
    assertInTenant: async (table, id, tenantId, errorIfMissing) => {
        if (!id) return;
        const row = await dbHelper.selectOne(
            `SELECT id FROM ${table} WHERE id = :id AND tenant_id = :tenantId AND deleted_at IS NULL`,
            {id, tenantId}
        );
        if (!row) throw ApiError.validation(errorIfMissing);
    },

    // Joined columns -> campus: {id, name, city, state, country} and eligibilitySet: {id, name, publishedVersion}, or null
    toResponse: (row) => ({
        ..._.omit(row, JOINED_COLUMNS),
        campus: row.campusId
            ? {id: row.campusId, name: row.campusName, city: row.campusCity, state: row.campusState, country: row.campusCountry}
            : null,
        eligibilitySet: row.eligibilitySetId
            ? {id: row.eligibilitySetId, name: row.eligibilitySetName, publishedVersion: row.eligibilityPublishedVersion}
            : null,
    }),
};

export default programService;
