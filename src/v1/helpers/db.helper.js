import _ from "lodash";
import {QueryTypes} from "sequelize";
import databaseModel from "../utils/database.util.js";
import {ApiError} from "../utils/ApiError.js";
import {HTTP_RESPONSES} from "../constants/http-response-messages.constants.js";

const dbHelper = {
    /**
     * Runs a raw SELECT and returns the rows. Every value goes in as a :named replacement, never
     * into the SQL string, so it is always escaped. Inside a transaction pass {transaction}: the read
     * then runs on the transaction's connection and sees its not yet committed writes.
     * @example dbHelper.select("SELECT id, name FROM campuses WHERE tenant_id = :tenantId", {tenantId})
     */
    select: (sql, replacements = {}, {transaction} = {}) =>
        databaseModel.sequelize.query(sql, {replacements, type: QueryTypes.SELECT, transaction}),

    // First row, or null
    selectOne: async (sql, replacements, options) => _.head(await dbHelper.select(sql, replacements, options)) ?? null,

    // First row, or a 404 with notFoundMessage
    selectOneOrFail: async (sql, replacements, notFoundMessage, options) => {
        const row = await dbHelper.selectOne(sql, replacements, options);
        if (!row) throw ApiError.of(HTTP_RESPONSES.HTTP_NOT_FOUND, notFoundMessage);
        return row;
    },

    /**
     * One page of a list: runs the COUNT and the rows query at once and answers {items, total, page, limit}.
     * rowsSql gets :limit and :offset; mapRow (optional) shapes each row.
     * @example dbHelper.paginate({countSql: `SELECT COUNT(*) AS total FROM campuses c ${where}`, rowsSql: `${SELECT} ${where} ORDER BY c.name`, replacements, page, limit})
     */
    paginate: async ({countSql, rowsSql, replacements, page, limit, mapRow = _.identity}) => {
        const [{total}, rows] = await Promise.all([
            dbHelper.selectOne(countSql, replacements),
            dbHelper.select(rowsSql, {...replacements, limit, offset: (page - 1) * limit}),
        ]);
        return {items: rows.map((row) => mapRow(row)), total, page, limit};
    },

    // {status: count} for every status in labels (0 for the missing ones), from rows of {status, count}
    countsBy: (rows, labels) => {
        const countByStatus = _.mapValues(_.keyBy(rows, "status"), "count");
        return _.mapValues(labels, (label, status) => countByStatus[status] ?? 0);
    },

    // "" from an empty form field is stored as NULL
    emptyToNull: (values) => _.mapValues(values, (value) => (value === "" ? null : value)),

    // "50%_off" -> "%50\%\_off%": matches the text anywhere, with LIKE wildcards in it taken literally
    likePattern: (text) => `%${text.replace(/[\\%_]/g, "\\$&")}%`,

    // Runs an insert / update; a unique key clash becomes a 409 with conflictMessage
    saveOrConflict: async (save, conflictMessage) => {
        try {
            return await save();
        } catch (error) {
            if (error.name === "SequelizeUniqueConstraintError") throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, conflictMessage);
            throw error;
        }
    },

    /**
     * 409 with inUseMessage when the SELECT finds a row. Deletes are soft (deleted_at), which foreign
     * keys never see, so "still used by another row" is checked with a query before deleting.
     * @example dbHelper.assertUnused("SELECT id FROM programs WHERE campus_id = :id AND deleted_at IS NULL LIMIT 1", {id}, "Campus is used")
     */
    assertUnused: async (sql, replacements, inUseMessage, options) => {
        const row = await dbHelper.selectOne(sql, replacements, options);
        if (row) throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, inUseMessage);
    },
};

export default dbHelper;
