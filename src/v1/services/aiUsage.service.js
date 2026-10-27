import _ from "lodash";
import databaseModel from "../utils/database.util.js";
import requestContext from "../utils/requestContext.util.js";
import {ApiError} from "../utils/ApiError.js";
import {AI_OPERATION_LABELS, AI_USAGE_CHART_DAYS, AI_USAGE_STATUSES} from "../constants/aiUsage.constants.js";
import dbHelper from "../helpers/db.helper.js";
import dateHelper from "../helpers/date.helper.js";

const TOKENS = "(l.input_tokens + l.output_tokens)";

const LOG_SELECT = `
    SELECT l.id, l.operation, l.model_code AS modelCode, m.name AS modelName, p.name AS providerName, l.status, l.error_message AS errorMessage,
           l.input_tokens AS inputTokens, l.cached_input_tokens AS cachedInputTokens, l.output_tokens AS outputTokens,
           l.cost_usd AS costUsd, l.duration_ms AS durationMs, l.provider_request_id AS providerRequestId, l.created_at AS createdAt,
           l.application_id AS applicationId, a.application_number AS applicationNumber, l.document_id AS documentId,
           l.triggered_by AS triggeredById, u.name AS triggeredByName
    FROM ai_usage_logs l
    LEFT JOIN ai_models m ON m.id = l.model_id
    LEFT JOIN ai_providers p ON p.id = m.provider_id
    LEFT JOIN applications a ON a.id = l.application_id
    LEFT JOIN users u ON u.id = l.triggered_by`;

/**
 * Tokens and cost of every AI call. The AI code calls record() after each request; the AI Usage
 * page reads list() and summary(). Costs are in USD, from the model's prices when the call was made.
 */
const aiUsageService = {
    /**
     * Logs one AI request. Pass the token counts the provider returned; the cost comes from the
     * model's prices (null while they are not set). Who triggered it comes from the request, if any.
     * @example aiUsageService.record({tenantId, applicationId, operation: "assessment", modelId, inputTokens: 1200, outputTokens: 300, durationMs: 2400})
     */
    record: async ({tenantId, applicationId, documentId, assessmentId, operation, modelId, inputTokens = 0, cachedInputTokens = 0, outputTokens = 0,
        durationMs, status = AI_USAGE_STATUSES.SUCCESS, errorMessage, providerRequestId, triggeredBy}, transaction) => {
        const model = await dbHelper.selectOneOrFail(
            `SELECT id, code, input_price_per_1m AS input, cached_input_price_per_1m AS cachedInput, output_price_per_1m AS output
             FROM ai_models WHERE id = :modelId`,
            {modelId},
            "AI model not found",
            {transaction}
        );
        return databaseModel.aiUsageLog.create(
            {
                tenantId,
                applicationId: applicationId ?? null,
                documentId: documentId ?? null,
                assessmentId: assessmentId ?? null,
                operation,
                modelId: model.id,
                modelCode: model.code,
                inputTokens,
                cachedInputTokens,
                outputTokens,
                costUsd: aiUsageService.costOf(model, {inputTokens, cachedInputTokens, outputTokens}),
                durationMs: durationMs ?? null,
                status,
                errorMessage: errorMessage ? _.truncate(errorMessage, {length: 500}) : null,
                providerRequestId: providerRequestId ?? null,
                triggeredBy: triggeredBy ?? requestContext.get().user?.id ?? null,
            },
            {transaction}
        );
    },

    /**
     * USD for one call, from prices per 1M tokens. Cached input tokens are part of the input tokens
     * and use the cached price (the normal input price when there is none). null when prices are not set.
     */
    costOf: (prices, {inputTokens, cachedInputTokens, outputTokens}) => {
        if (_.isNil(prices.input) || _.isNil(prices.output)) return null;
        const cachedPrice = _.isNil(prices.cachedInput) ? Number(prices.input) : Number(prices.cachedInput);
        const cost = (inputTokens - cachedInputTokens) * Number(prices.input) + cachedInputTokens * cachedPrice + outputTokens * Number(prices.output);
        return _.round(cost / 1_000_000, 6);
    },

    // The log, newest first
    list: (query, tenantId) => {
        const {where, replacements} = aiUsageService.filters(query, tenantId);
        return dbHelper.paginate({
            countSql: `SELECT COUNT(*) AS total FROM ai_usage_logs l ${where}`,
            // created_at first, so the (tenant_id, created_at) index serves the order
            rowsSql: `${LOG_SELECT} ${where} ORDER BY l.created_at DESC, l.id DESC LIMIT :limit OFFSET :offset`,
            replacements,
            page: query.page,
            limit: query.limit,
            mapRow: aiUsageService.toResponse,
        });
    },

    /**
     * Totals for the period, a day by day chart, and the split by model and by operation.
     * Without from / to the totals cover all time and the chart the last 30 days.
     */
    summary: async (query, tenantId) => {
        const {start, end} = dateHelper.chartRange(query, AI_USAGE_CHART_DAYS);
        const {where, replacements} = aiUsageService.filters(query, tenantId);
        const sums = `COUNT(*) AS requests, COALESCE(SUM(${TOKENS}), 0) AS tokens, SUM(l.cost_usd) AS costUsd`;

        const [totals, byDay, byModel, byOperation] = await Promise.all([
            dbHelper.selectOne(
                `SELECT COUNT(*) AS requests, COALESCE(SUM(l.status = 'failed'), 0) AS failed,
                        COALESCE(SUM(l.input_tokens), 0) AS inputTokens, COALESCE(SUM(l.cached_input_tokens), 0) AS cachedInputTokens,
                        COALESCE(SUM(l.output_tokens), 0) AS outputTokens, COALESCE(SUM(${TOKENS}), 0) AS totalTokens,
                        SUM(l.cost_usd) AS costUsd, COALESCE(SUM(l.cost_usd IS NULL), 0) AS unpricedRequests
                 FROM ai_usage_logs l ${where}`,
                replacements
            ),
            dbHelper.select(
                `SELECT DATE_FORMAT(${dateHelper.localSql("l.created_at")}, '%Y-%m-%d') AS date, ${sums}
                 FROM ai_usage_logs l
                 WHERE l.tenant_id = :tenantId AND l.deleted_at IS NULL AND ${dateHelper.inRangeSql("l.created_at", "chartStart", "chartEnd")}
                 GROUP BY date`,
                {...replacements, chartStart: start, chartEnd: end}
            ),
            dbHelper.select(
                `SELECT l.model_id AS modelId, l.model_code AS modelCode, m.name AS modelName, p.name AS providerName, ${sums}
                 FROM ai_usage_logs l LEFT JOIN ai_models m ON m.id = l.model_id LEFT JOIN ai_providers p ON p.id = m.provider_id ${where}
                 GROUP BY l.model_id, l.model_code, m.name, p.name ORDER BY requests DESC`,
                replacements
            ),
            dbHelper.select(`SELECT l.operation, ${sums} FROM ai_usage_logs l ${where} GROUP BY l.operation ORDER BY requests DESC`, replacements),
        ]);

        const money = (row) => ({...row, costUsd: aiUsageService.money(row.costUsd)});
        return {
            period: {from: query.from ?? null, to: query.to ?? null, utcOffset: query.utcOffset},
            totals: money(totals),
            byDay: dateHelper.fillDays(byDay.map(money), start, end, (date) => ({date, requests: 0, tokens: 0, costUsd: null})),
            byModel: byModel.map(money),
            byOperation: byOperation.map((row) => ({...money(row), label: AI_OPERATION_LABELS[row.operation]})),
        };
    },

    // The WHERE both list() and summary() use
    filters: ({from, to, utcOffset, operation, modelId, applicationId, status}, tenantId) => {
        if (from && to && from > to) throw ApiError.validation({from: "From must be on or before to"});
        const conditions = ["l.tenant_id = :tenantId", "l.deleted_at IS NULL"];
        if (from) conditions.push("l.created_at >= :from - INTERVAL :utcOffset MINUTE");
        if (to) conditions.push("l.created_at < :to + INTERVAL 1 DAY - INTERVAL :utcOffset MINUTE");
        if (operation) conditions.push("l.operation = :operation");
        if (modelId) conditions.push("l.model_id = :modelId");
        if (applicationId) conditions.push("l.application_id = :applicationId");
        if (status) conditions.push("l.status = :status");
        return {
            where: `WHERE ${conditions.join(" AND ")}`,
            replacements: {tenantId, from, to, utcOffset, operation, modelId, applicationId, status},
        };
    },

    // Rounded to 6 decimals; null stays null (no priced call)
    money: (value) => (_.isNil(value) ? null : _.round(value, 6)),

    toResponse: ({triggeredById, triggeredByName, modelName, providerName, applicationNumber, ...row}) => ({
        ...row,
        operationLabel: AI_OPERATION_LABELS[row.operation],
        model: {code: row.modelCode, name: modelName ?? row.modelCode, provider: providerName ?? null},
        totalTokens: row.inputTokens + row.outputTokens,
        costUsd: aiUsageService.money(row.costUsd),
        application: row.applicationId ? {id: row.applicationId, applicationNumber} : null,
        triggeredBy: triggeredById ? {id: triggeredById, name: triggeredByName} : null,
    }),
};

export default aiUsageService;
