import _ from "lodash";
import {ApiError} from "../utils/ApiError.js";

const DAY_MS = 86_400_000;
const MAX_PERIOD_DAYS = 366;

/**
 * Day-based periods for reports (dashboard, AI usage). Days are "YYYY-MM-DD" strings in the viewer's
 * own time zone: utcOffset is their offset from UTC in minutes (India: 330).
 */
const dateHelper = {
    // Today, or the day of `date`, in the viewer's time zone
    localDate: (date, utcOffset) => new Date(date.getTime() + utcOffset * 60_000).toISOString().slice(0, 10),

    addDays: (day, days) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10),

    daysBetween: (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS),

    /**
     * The days a daily chart covers: from / to when sent, else the last `defaultDays` days up to today.
     * 422 when from is after to or the period is longer than MAX_PERIOD_DAYS.
     */
    chartRange: ({from, to, utcOffset}, defaultDays) => {
        const end = to ?? dateHelper.localDate(new Date(), utcOffset);
        const start = from ?? dateHelper.addDays(end, 1 - defaultDays);
        if (start > end) throw ApiError.validation({from: "From must be on or before to"});
        if (dateHelper.daysBetween(start, end) >= MAX_PERIOD_DAYS) {
            throw ApiError.validation({to: `Pick a period of at most ${MAX_PERIOD_DAYS} days`});
        }
        return {start, end};
    },

    // SQL: a DATETIME column (UTC) as the viewer's local time. Needs the :utcOffset replacement
    localSql: (column) => `(${column} + INTERVAL :utcOffset MINUTE)`,

    // SQL: the column's local day is within :from / :to (each may be NULL = open)
    inPeriodSql: (column) =>
        `(:from IS NULL OR ${column} >= :from - INTERVAL :utcOffset MINUTE) AND (:to IS NULL OR ${column} < :to + INTERVAL 1 DAY - INTERVAL :utcOffset MINUTE)`,

    // SQL: the column's local day is from :fromParam to :toParam, both included. The offset is applied to
    // the days, not to the column, so an index on the column can be used
    inRangeSql: (column, fromParam, toParam) =>
        `${column} >= :${fromParam} - INTERVAL :utcOffset MINUTE AND ${column} < :${toParam} + INTERVAL 1 DAY - INTERVAL :utcOffset MINUTE`,

    // One entry per day from start to end: the row for that day, or emptyRow(date) when there is none
    fillDays: (rows, start, end, emptyRow) => {
        const rowByDate = _.keyBy(rows, "date");
        return _.range(dateHelper.daysBetween(start, end) + 1).map((index) => {
            const date = dateHelper.addDays(start, index);
            return rowByDate[date] ?? emptyRow(date);
        });
    },
};

export default dateHelper;
