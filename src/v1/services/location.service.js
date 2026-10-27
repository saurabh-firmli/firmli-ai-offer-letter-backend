import dbHelper from "../helpers/db.helper.js";

// Countries / states / cities are master data shared by all tenants (scripts/seed-locations.js)
const locationService = {
    countries: ({search}) =>
        dbHelper.select(
            `SELECT id, name, iso2, phone_code AS phoneCode, currency_code AS currencyCode
             FROM countries
             WHERE deleted_at IS NULL ${locationService.searchClause(search)}
             ORDER BY name`,
            {search: search && dbHelper.likePattern(search)}
        ),

    states: ({countryId, search}) =>
        dbHelper.select(
            `SELECT id, name, code
             FROM states
             WHERE country_id = :countryId AND deleted_at IS NULL ${locationService.searchClause(search)}
             ORDER BY name`,
            {countryId, search: search && dbHelper.likePattern(search)}
        ),

    cities: ({stateId, search}) =>
        dbHelper.select(
            `SELECT id, name
             FROM cities
             WHERE state_id = :stateId AND deleted_at IS NULL ${locationService.searchClause(search)}
             ORDER BY name`,
            {stateId, search: search && dbHelper.likePattern(search)}
        ),

    /**
     * LEFT JOINs that turn a city id column into its city (ci), state (st) and country (co).
     * They keep showing a place even if it is later removed from the lists, like any saved address.
     * cityIdColumn is a column name from our own code, never user input.
     * @example `FROM campuses c ${locationService.joinLocation("c.city_id")}`
     */
    joinLocation: (cityIdColumn) => `
        LEFT JOIN cities ci ON ci.id = ${cityIdColumn}
        LEFT JOIN states st ON st.id = ci.state_id
        LEFT JOIN countries co ON co.id = st.country_id`,

    searchClause: (search) => (search ? "AND name LIKE :search" : ""),
};

export default locationService;
