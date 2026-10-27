import Joi from "joi";
import common from "./common.validation.js";
import {AUDIT_ACTIONS, AUDITED_ENTITY_TYPES, AUDITED_MODULES} from "../../constants/audit.constants.js";

const auditLogValidation = {
    list: Joi.object({
        ...common.pagination,
        module: Joi.string().valid(...AUDITED_MODULES),
        action: Joi.string().valid(...AUDIT_ACTIONS),
        entityType: Joi.string().valid(...AUDITED_ENTITY_TYPES),
        entityId: common.id,
        userId: common.id,
        from: common.dateOnly,
        to: common.dateOnly,
        search: common.searchText,
    }),
};

export default auditLogValidation;
