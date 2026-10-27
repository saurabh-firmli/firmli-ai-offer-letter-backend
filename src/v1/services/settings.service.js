import path from "node:path";
import _ from "lodash";
import databaseModel from "../utils/database.util.js";
import logger from "../utils/logger.util.js";
import {ApiError} from "../utils/ApiError.js";
import {MODULES} from "../constants/module.constants.js";
import {BOOLEAN_SETTINGS, DEFAULT_AI_MODELS, TENANT_FIELDS} from "../constants/settings.constants.js";
import dbHelper from "../helpers/db.helper.js";
import auditHelper from "../helpers/audit.helper.js";
import cryptoHelper from "../helpers/crypto.helper.js";
import emailHelper from "../helpers/email.helper.js";
import storageHelper from "../helpers/storage.helper.js";
import networkHelper from "../helpers/network.helper.js";
import settingsEmails from "../emails/settings.email.js";
import config from "../configs/env.config.js";
import userService from "./user.service.js";

const SETTINGS_SELECT = `
    SELECT t.name, t.code, t.contact_email AS contactEmail, t.phone, t.address, t.website,
           t.logo_storage_key AS logoStorageKey, t.brand_color AS brandColor,
           s.auto_assessment AS autoAssessment, s.auto_letter_generation AS autoLetterGeneration,
           s.auto_email_dispatch AS autoEmailDispatch,
           s.auto_approve_offers AS autoApproveOffers, s.auto_approve_rejections AS autoApproveRejections,
           s.require_rejection_approval AS requireRejectionApproval,
           s.require_manual_review_edge_cases AS requireManualReviewEdgeCases,
           s.flag_low_confidence AS flagLowConfidence, s.flag_missing_documents AS flagMissingDocuments,
           s.offer_confidence_threshold AS offerConfidenceThreshold,
           s.rejection_confidence_threshold AS rejectionConfidenceThreshold,
           s.default_reviewer_id AS defaultReviewerId, u.name AS defaultReviewerName,
           s.email_max_retries AS emailMaxRetries,
           s.smtp_enabled AS smtpEnabled, s.smtp_host AS smtpHost, s.smtp_port AS smtpPort, s.smtp_secure AS smtpSecure,
           s.smtp_user AS smtpUser, s.smtp_password_encrypted IS NOT NULL AS smtpPasswordSet,
           s.smtp_from_email AS smtpFromEmail, s.smtp_from_name AS smtpFromName,
           s.extraction_model_id AS extractionModelId, s.extraction_fallback_model_id AS extractionFallbackModelId,
           s.assessment_model_id AS assessmentModelId, s.assessment_escalation_model_id AS assessmentEscalationModelId,
           s.verify_document_type AS verifyDocumentType,
           s.extraction_prompt AS extractionPrompt, s.assessment_prompt AS assessmentPrompt,
           s.openai_api_key_last4 AS openaiApiKeyLast4,
           GREATEST(t.updated_at, s.updated_at) AS updatedAt
    FROM tenants t
    JOIN tenant_settings s ON s.tenant_id = t.id AND s.deleted_at IS NULL
    LEFT JOIN users u ON u.id = s.default_reviewer_id AND u.deleted_at IS NULL
    WHERE t.id = :tenantId AND t.deleted_at IS NULL`;

/**
 * Secrets: saved encrypted, never sent back, and shown as *** in the audit log. column is where the
 * encrypted value goes; hint, when there is one, keeps the last 4 characters readable for "sk-...abcd".
 */
const SECRET_SETTINGS = {
    openaiApiKey: {column: "openaiApiKeyEncrypted", hint: "openaiApiKeyLast4", isSet: (settings) => settings.aiConfigured},
    smtpPassword: {column: "smtpPasswordEncrypted", isSet: (settings) => settings.smtpPasswordSet},
};

// The Settings page of the logged in user's tenant
const settingsService = {
    // With a short-lived link to the logo for showing it (null without a logo)
    get: async (tenantId) => {
        const row = await dbHelper.selectOneOrFail(SETTINGS_SELECT, {tenantId}, "Settings not found");
        const logo = row.logoStorageKey ? await storageHelper.downloadUrl(row.logoStorageKey, `logo${path.extname(row.logoStorageKey)}`, {inline: true}) : null;
        return {...settingsService.toResponse(row), logo};
    },

    // Settings > Logo: a PNG or JPG for the letterhead of every letter PDF. Replaces the one before
    saveLogo: async (file, tenantId) => {
        const current = await settingsService.logoKey(tenantId);
        const key = `tenants/${tenantId}/branding/logo-${Date.now()}${path.extname(file.originalname).toLowerCase()}`;
        await storageHelper.save(key, file.buffer, file.mimetype);
        try {
            await settingsService.setLogo(tenantId, current, key);
        } catch (error) {
            await storageHelper.remove(key).catch(() => {});
            throw error;
        }
        if (current) await storageHelper.remove(current).catch((error) => logger.warn({err: error, key: current}, "Old logo not removed"));
        return settingsService.get(tenantId);
    },

    removeLogo: async (tenantId) => {
        const current = await settingsService.logoKey(tenantId);
        if (current) {
            await settingsService.setLogo(tenantId, current, null);
            await storageHelper.remove(current).catch((error) => logger.warn({err: error, key: current}, "Old logo not removed"));
        }
        return settingsService.get(tenantId);
    },

    logoKey: async (tenantId) =>
        (await dbHelper.selectOne("SELECT logo_storage_key AS logoStorageKey FROM tenants WHERE id = :tenantId", {tenantId}))?.logoStorageKey ?? null,

    // The file itself is never in the audit log, only that the logo was added, replaced or removed
    setLogo: (tenantId, from, to) =>
        databaseModel.sequelize.transaction(async (transaction) => {
            await databaseModel.tenant.update({logoStorageKey: to}, {where: {id: tenantId}, transaction});
            await auditHelper.write(
                {
                    module: MODULES.SETTINGS,
                    entityType: "settings",
                    entityId: tenantId,
                    entityLabel: "Settings",
                    action: "update",
                    changes: {logo: {from: from && "previous logo", to: to && "new logo"}},
                },
                transaction
            );
        }),

    // The automation and approval switches (as booleans) and the email retries, for the code that acts on them
    flags: async (tenantId) => {
        const row = await dbHelper.selectOne(
            `SELECT auto_assessment AS autoAssessment, auto_letter_generation AS autoLetterGeneration, auto_email_dispatch AS autoEmailDispatch,
                    auto_approve_offers AS autoApproveOffers, auto_approve_rejections AS autoApproveRejections,
                    require_rejection_approval AS requireRejectionApproval, email_max_retries AS emailMaxRetries
             FROM tenant_settings WHERE tenant_id = :tenantId AND deleted_at IS NULL`,
            {tenantId}
        );
        return {..._.mapValues(_.omit(row, "emailMaxRetries"), Boolean), emailMaxRetries: row?.emailMaxRetries ?? 0};
    },

    // Dropdown options: the AI models (with their provider) and the users who can be the default reviewer.
    // Models of a provider the app cannot call yet come with available: false (show them disabled)
    options: async (tenantId) => {
        const [aiModels, reviewers] = await Promise.all([
            dbHelper.select(
                `SELECT m.id, m.code, m.name, m.description, m.input_price_per_1m AS inputPricePer1m,
                        m.cached_input_price_per_1m AS cachedInputPricePer1m, m.output_price_per_1m AS outputPricePer1m,
                        p.code AS providerCode, p.name AS providerName, p.is_available AS available
                 FROM ai_models m JOIN ai_providers p ON p.id = m.provider_id
                 WHERE m.deleted_at IS NULL AND p.deleted_at IS NULL
                 ORDER BY p.sort_order, m.sort_order, m.name`
            ),
            userService.assignable(tenantId),
        ]);
        return {
            aiModels: aiModels.map(({providerCode, providerName, available, ...model}) => ({
                ...model,
                provider: {code: providerCode, name: providerName},
                available: Boolean(available),
            })),
            reviewers,
        };
    },

    /**
     * Saves the fields sent; the others stay. Institution details go to the tenant row, the rest to
     * tenant_settings. One save is one audit entry: {field: {from, to}} for what actually changed.
     */
    update: async (values, tenantId) => {
        const current = await settingsService.get(tenantId);
        const secrets = _.pick(values, Object.keys(SECRET_SETTINGS));
        const columns = dbHelper.emptyToNull(_.omit(values, Object.keys(SECRET_SETTINGS)));
        await settingsService.assertValid(columns, {...current, ...columns}, secrets, current, tenantId);

        const changes = {...settingsService.changesOf(current, columns), ...settingsService.secretChanges(current, secrets)};
        if (_.isEmpty(changes)) return current;

        await databaseModel.sequelize.transaction(async (transaction) => {
            const tenantColumns = _.pick(columns, TENANT_FIELDS);
            const settingColumns = {..._.omit(columns, TENANT_FIELDS), ...settingsService.secretColumns(secrets)};
            if (!_.isEmpty(tenantColumns)) await databaseModel.tenant.update(tenantColumns, {where: {id: tenantId}, transaction});
            if (!_.isEmpty(settingColumns)) await databaseModel.tenantSetting.update(settingColumns, {where: {tenantId}, transaction});
            await auditHelper.write(
                {module: MODULES.SETTINGS, entityType: "settings", entityId: tenantId, entityLabel: "Settings", action: "update", changes},
                transaction
            );
        });
        return settingsService.get(tenantId);
    },

    // The tenant's own OpenAI key, decrypted, for the AI assessment; null when not set
    openaiApiKey: async (tenantId) => {
        const row = await dbHelper.selectOne(
            "SELECT openai_api_key_encrypted AS encrypted FROM tenant_settings WHERE tenant_id = :tenantId AND deleted_at IS NULL",
            {tenantId}
        );
        return row?.encrypted ? cryptoHelper.decrypt(row.encrypted) : null;
    },

    // Per secret sent: "" or null removes it, a value is encrypted. Secrets not sent stay as they are
    secretColumns: (secrets) =>
        Object.assign(
            {},
            ..._.map(secrets, (value, field) => {
                const {column, hint} = SECRET_SETTINGS[field];
                return {[column]: value ? cryptoHelper.encrypt(value) : null, ...(hint ? {[hint]: value ? value.slice(-4) : null} : {})};
            })
        ),

    // A secret never goes into the audit log, only that it was set, replaced or removed
    secretChanges: (current, secrets) =>
        _.pickBy(
            _.mapValues(secrets, (value, field) => {
                const isSet = SECRET_SETTINGS[field].isSet(current);
                return !value && !isSet ? null : {from: isSet ? "***" : null, to: value ? "***" : null};
            }),
            Boolean
        ),

    // "Send test email": sends through the client's SMTP (or Firmli's) and reports the server's reason when it fails
    sendTestEmail: async (to, user) => {
        const {name} = await settingsService.get(user.tenantId);
        const info = await emailHelper.send(
            {tenantId: user.tenantId, to: to ?? user.email, ...settingsEmails.test({institutionName: name})},
            {explainErrors: true}
        );
        return {sentTo: to ?? user.email, sender: info.sender};
    },

    // A new tenant's settings: the table defaults, plus the default AI models
    createDefaults: async (tenantId, transaction) => {
        const models = await dbHelper.select(
            "SELECT id, code FROM ai_models WHERE code IN (:codes) AND deleted_at IS NULL",
            {codes: _.uniq(Object.values(DEFAULT_AI_MODELS))},
            {transaction}
        );
        const idByCode = _.mapValues(_.keyBy(models, "code"), "id");
        await databaseModel.tenantSetting.create(
            {tenantId, ..._.mapValues(DEFAULT_AI_MODELS, (code) => idByCode[code])},
            {transaction}
        );
    },

    assertValid: async (columns, next, secrets, current, tenantId) => {
        const errors = {};

        if (next.smtpEnabled) {
            if (!next.smtpHost) errors.smtpHost = "Enter the SMTP server";
            if (!next.smtpPort) errors.smtpPort = "Enter the SMTP port";
            if (!next.smtpFromEmail) errors.smtpFromEmail = "Enter the address emails are sent from";
            const passwordSet = secrets.smtpPassword === undefined ? current.smtpPasswordSet : Boolean(secrets.smtpPassword);
            if (next.smtpUser && !passwordSet) errors.smtpPassword = "Enter the SMTP password";
        }
        if (columns.smtpHost) {
            const hostError = await settingsService.smtpHostError(columns.smtpHost);
            if (hostError) errors.smtpHost = hostError;
        }

        const modelFields = Object.keys(DEFAULT_AI_MODELS).filter((field) => field in columns);
        if (modelFields.length) {
            const known = _.map(
                await dbHelper.select(
                    `SELECT m.id FROM ai_models m JOIN ai_providers p ON p.id = m.provider_id
                     WHERE m.id IN (:ids) AND m.deleted_at IS NULL AND p.is_available = 1 AND p.deleted_at IS NULL`,
                    {ids: modelFields.map((field) => columns[field])}
                ),
                "id"
            );
            modelFields
                .filter((field) => !known.includes(columns[field]))
                .forEach((field) => (errors[field] = "AI model not found, or its provider is not available yet"));
        }

        if (columns.defaultReviewerId) {
            const reviewer = await userService.findAssignable(columns.defaultReviewerId, tenantId);
            if (!reviewer) errors.defaultReviewerId = "Pick a user of your institution who can log in";
        }

        if (next.autoApproveRejections && next.requireRejectionApproval) {
            errors.autoApproveRejections = "Turn off \"Always require approval for rejections\" to auto-approve rejections";
        }

        if (!_.isEmpty(errors)) throw ApiError.validation(errors);
    },

    // {field: {from, to}} for each sent field whose value differs
    changesOf: (current, columns) =>
        _.pickBy(
            _.mapValues(columns, (value, field) => ({from: current[field], to: value})),
            ({from, to}) => !_.isEqual(from, to)
        ),

    // 0 / 1 -> booleans, DECIMAL text -> numbers; a deleted default reviewer counts as none.
    // The OpenAI key is never sent back, only masked
    // Outside development a client's SMTP server must be on the public internet, by the address its name resolves to
    smtpHostError: async (host) => {
        if (config.isDevelopment) return null;
        const address = await networkHelper.publicAddressOf(host).catch(() => undefined);
        if (address === undefined) return "We could not find this server; check its name";
        return address ? null : "Use your mail provider's public SMTP server";
    },

    toResponse: ({defaultReviewerName, openaiApiKeyLast4, smtpPasswordSet, logoStorageKey, ...row}) => ({
        ...row,
        ..._.mapValues(_.pick(row, BOOLEAN_SETTINGS), Boolean),
        defaultReviewerId: defaultReviewerName ? row.defaultReviewerId : null,
        defaultReviewer: defaultReviewerName ? {id: row.defaultReviewerId, name: defaultReviewerName} : null,
        openaiApiKey: openaiApiKeyLast4 ? `sk-...${openaiApiKeyLast4}` : null,
        aiConfigured: Boolean(openaiApiKeyLast4),
        smtpPasswordSet: Boolean(smtpPasswordSet),
        // Who students see emails from: the client's own server, or Firmli's in the institution's name
        emailSender: row.smtpEnabled
            ? {type: "custom", from: `${row.smtpFromName || row.name} <${row.smtpFromEmail}>`}
            : {type: "default", from: emailHelper.firmliFrom(row.name)},
    }),
};

export default settingsService;
