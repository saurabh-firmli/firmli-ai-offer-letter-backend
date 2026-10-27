/**
 * Fills countries / states / cities (database/migrations/005_locations.sql) from the
 * country-state-city package: 250 countries, ~5,000 states, ~148,000 cities.
 * Safe to run again: rows that are already there are skipped.
 *
 *   npm run seed:locations
 *
 * Uses the database from the env file in the npm script (.env.development.local = local DB).
 * country-state-city is a devDependency used only here (GPL-3.0 package; its data comes from the
 * ODbL-licensed countries-states-cities-database).
 */
import _ from "lodash";
import {City, Country, State} from "country-state-city";
import {closeDatabase, initDatabase} from "../src/v1/utils/database.util.js";
import databaseModel from "../src/v1/utils/database.util.js";
import dbHelper from "../src/v1/helpers/db.helper.js";

const BATCH_SIZE = 2000;

// Multi-row INSERT IGNORE in batches: a row clashing with a unique key (already seeded) is skipped
const insertIgnore = async (table, columns, rows) => {
    for (const batch of _.chunk(rows, BATCH_SIZE)) {
        await databaseModel.sequelize.query(`INSERT IGNORE INTO ${table} (${columns.join(", ")}) VALUES :rows`, {
            replacements: {rows: batch},
        });
    }
};

// {key: id} from rows of {key, id}
const idsBy = (rows, key) => _.mapValues(_.keyBy(rows, key), "id");

await initDatabase();

try {
    await insertIgnore(
        "countries",
        ["name", "iso2", "phone_code", "currency_code"],
        Country.getAllCountries().map((country) => [
            country.name,
            country.isoCode,
            country.phonecode || null,
            country.currency || null,
        ])
    );
    const countryIds = idsBy(await dbHelper.select("SELECT id, iso2 FROM countries WHERE deleted_at IS NULL"), "iso2");

    await insertIgnore(
        "states",
        ["country_id", "name", "code"],
        State.getAllStates().map((state) => [countryIds[state.countryCode], state.name, state.isoCode])
    );
    // A state code is only unique inside its country, so the key is "IN-PB"
    const stateIds = idsBy(
        await dbHelper.select("SELECT s.id, CONCAT(c.iso2, '-', s.code) AS stateKey FROM states s JOIN countries c ON c.id = s.country_id WHERE s.deleted_at IS NULL"),
        "stateKey"
    );

    await insertIgnore(
        "cities",
        ["state_id", "name"],
        City.getAllCities().map((city) => [stateIds[`${city.countryCode}-${city.stateCode}`], city.name])
    );

    const counts = await dbHelper.selectOne(`
        SELECT (SELECT COUNT(*) FROM countries WHERE deleted_at IS NULL) AS countries,
               (SELECT COUNT(*) FROM states WHERE deleted_at IS NULL) AS states,
               (SELECT COUNT(*) FROM cities WHERE deleted_at IS NULL) AS cities`);
    console.log(`Locations in the database: ${counts.countries} countries, ${counts.states} states, ${counts.cities} cities.`);
} catch (error) {
    console.error(error);
    process.exitCode = 1;
} finally {
    await closeDatabase();
}
