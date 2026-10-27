import databaseModel from "../utils/database.util.js";
import {ApiError} from "../utils/ApiError.js";
import dbHelper from "../helpers/db.helper.js";
import locationService from "./location.service.js";

const NOT_FOUND = "Campus not found";
const DUPLICATE = "A campus with this name already exists in this city";
const IN_USE = "Campus is used by programs; move them to another campus first";

// Location ids preselect the edit form's dropdowns, names are for display (all NULL without a city)
const CAMPUS_SELECT = `
    SELECT c.id, c.tenant_id AS tenantId, c.name,
           c.city_id AS cityId, st.id AS stateId, co.id AS countryId,
           ci.name AS city, st.name AS state, co.name AS country,
           c.created_at AS createdAt, c.updated_at AS updatedAt
    FROM campuses c
    ${locationService.joinLocation("c.city_id")}
    WHERE c.deleted_at IS NULL`;

// Every method works inside one tenant (tenantId comes from req.user)
const campusService = {
    // Few rows, used for a dropdown: the whole list, no pagination
    list: ({search}, tenantId) => {
        const searchClause = search
            ? "AND (c.name LIKE :search OR ci.name LIKE :search OR st.name LIKE :search OR co.name LIKE :search)"
            : "";

        return dbHelper.select(`${CAMPUS_SELECT} AND c.tenant_id = :tenantId ${searchClause} ORDER BY c.name, ci.name`, {
            tenantId,
            search: search && dbHelper.likePattern(search),
        });
    },

    getById: (id, tenantId) =>
        dbHelper.selectOneOrFail(`${CAMPUS_SELECT} AND c.id = :id AND c.tenant_id = :tenantId`, {id, tenantId}, NOT_FOUND),

    create: async (values, tenantId) => {
        await campusService.assertCityExists(values.cityId);
        const campus = await dbHelper.saveOrConflict(() => databaseModel.campus.create({...values, tenantId}), DUPLICATE);
        return campusService.getById(campus.id, tenantId);
    },

    // Only this tenant's live row is updated; reading it back answers 404 when there was none
    update: async (id, values, tenantId) => {
        await campusService.assertCityExists(values.cityId);
        await dbHelper.saveOrConflict(() => databaseModel.campus.update(values, {where: {id, tenantId}}), DUPLICATE);
        return campusService.getById(id, tenantId);
    },

    remove: async (id, tenantId) => {
        await campusService.getById(id, tenantId);
        await dbHelper.assertUnused(
            "SELECT id FROM programs WHERE campus_id = :id AND deleted_at IS NULL LIMIT 1",
            {id},
            IN_USE
        );
        await databaseModel.campus.destroy({where: {id, tenantId}});
    },

    assertCityExists: async (cityId) => {
        if (!cityId) return;
        const city = await dbHelper.selectOne("SELECT id FROM cities WHERE id = :cityId AND deleted_at IS NULL", {cityId});
        if (!city) throw ApiError.validation({cityId: "City not found"});
    },
};

export default campusService;
