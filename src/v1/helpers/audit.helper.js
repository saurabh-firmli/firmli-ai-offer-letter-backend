import _ from "lodash";
import databaseModel from "../utils/database.util.js";
import requestContext from "../utils/requestContext.util.js";
import {AUDITED_MODELS, SECRET_FIELDS, UNLOGGED_FIELDS} from "../constants/audit.constants.js";

/**
 * Writes an audit log row for every create / update / delete of an audited model, from Sequelize
 * hooks, so no service has to remember to do it. Who did it comes from the request context.
 * The row is written in the same transaction as the change, so a rolled back change leaves no log.
 */
const auditHelper = {
    // Called once, after the models are loaded
    attach: () => {
        for (const [modelName, settings] of Object.entries(AUDITED_MODELS)) {
            const model = databaseModel[modelName];

            // Model.update / destroy / bulkCreate then run the per-row hooks too, so each row is
            // logged with its own before and after values
            const perRow = (...args) => {
                _.last(args).individualHooks = true;
            };
            model.addHook("beforeBulkCreate", perRow);
            model.addHook("beforeBulkUpdate", perRow);
            model.addHook("beforeBulkDestroy", perRow);

            const log = (action) => (row, options) => auditHelper.record({action, row, options, modelName, settings});
            model.addHook("afterCreate", log("create"));
            model.addHook("afterUpdate", log("update"));
            model.addHook("afterDestroy", log("delete"));
        }
    },

    record: async ({action, row, options, modelName, settings}) => {
        const changes = auditHelper.changesOf(action, row, settings.unlogged);
        if (_.isEmpty(changes)) return;

        const values = row.get({plain: true});
        await auditHelper.write(
            {
                tenantId: values.tenantId,
                module: settings.module,
                entityType: modelName,
                entityId: values.id,
                entityLabel: settings.label(values),
                action,
                changes,
            },
            options.transaction
        );
    },

    /**
     * One audit log row. Also used directly by a service when one save should read as a single
     * change (e.g. a role's permissions). tenantId defaults to the logged in user's tenant.
     */
    write: ({tenantId, module, entityType, entityId, entityLabel, action, changes}, transaction) => {
        const {user, requestId, ipAddress} = requestContext.get();
        return databaseModel.auditLog.create(
            {
                tenantId: tenantId ?? user?.tenantId ?? null,
                userId: user?.id ?? null,
                userName: user?.name ?? null,
                module,
                entityType,
                entityId: entityId ?? null,
                entityLabel: _.isNil(entityLabel) ? null : _.truncate(String(entityLabel), {length: 255}),
                action,
                changes,
                requestId: requestId ?? null,
                ipAddress: ipAddress ?? null,
            },
            {transaction, hooks: false}
        );
    },

    /**
     * {field: {from, to}}: for an update only the fields that changed, for a create every value set
     * (from null), for a delete every value the row had (to null). Secrets show as "***".
     */
    changesOf: (action, row, unlogged = []) => {
        const fields = action === "update" ? row.changed() || [] : Object.keys(row.get({plain: true}));
        const changes = {};
        for (const field of _.difference(fields, [...UNLOGGED_FIELDS, ...unlogged])) {
            const from = action === "create" ? null : auditHelper.plain(action === "update" ? row.previous(field) : row.get(field));
            const to = action === "delete" ? null : auditHelper.plain(row.get(field));
            if (auditHelper.isSame(from, to)) continue;

            changes[field] = SECRET_FIELDS.includes(field) ? {from: from && "***", to: to && "***"} : {from, to};
        }
        return changes;
    },

    // Dates as ISO text, everything else as it is
    plain: (value) => (value instanceof Date ? value.toISOString() : value ?? null),

    // A DECIMAL may be read back as "12.50" and sent as 12.5: when one side is a number, compare as numbers.
    // Two texts stay texts ("0123" -> "123" is a real change of a code)
    isSame: (a, b) => {
        if (_.isObject(a) || _.isObject(b)) return _.isEqual(a, b);
        const isNumeric = (value) => _.isNumber(value) || (_.isString(value) && value.trim() !== "" && Number.isFinite(Number(value)));
        if ((_.isNumber(a) || _.isNumber(b)) && isNumeric(a) && isNumeric(b)) return Number(a) === Number(b);
        return String(a) === String(b);
    },
};

export default auditHelper;
