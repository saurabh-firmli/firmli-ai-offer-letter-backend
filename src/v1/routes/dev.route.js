/**
 * Switch tenant / user, for Firmli staff: a user of a platform tenant (tenants.is_platform) sees the app
 * as any client's user, without their password, e.g. to help a client. Every switch is in the target
 * tenant's audit log. The paths stay /v1/dev/... (the frontend uses them).
 */
import _ from "lodash";
import express from "express";
import Joi from "joi";
import authService from "../services/auth.service.js";
import sessionService from "../services/session.service.js";
import {answerSession, requestMeta} from "../controllers/auth.controller.js";
import validate from "../middlewares/validate.middleware.js";
import commonValidation from "../schemas/validations/common.validation.js";
import responseHelper from "../helpers/response.helper.js";
import auditHelper from "../helpers/audit.helper.js";
import {asyncHandler} from "../utils/asyncHandler.js";
import {ApiError} from "../utils/ApiError.js";
import logger from "../utils/logger.util.js";
import {HTTP_RESPONSES} from "../constants/http-response-messages.constants.js";
import {MODULES} from "../constants/module.constants.js";
import {USER_STATUSES} from "../constants/user.constants.js";
import {TENANT_STATUSES} from "../constants/tenant.constants.js";
import {ERROR_CODES} from "../constants/error-codes.constants.js";
import dbHelper from "../helpers/db.helper.js";

const devRouter = express.Router();

// Every tenant with its users: [{id, name, isPlatform, users: [{id, name, email, role, status}]}]
devRouter.get(
    "/users",
    asyncHandler(async (req, res) => {
        const rows = await dbHelper.select(`
            SELECT t.id AS tenantId, t.name AS tenantName, t.is_platform AS isPlatform, u.id, u.name, u.email, r.code AS role, u.status
            FROM tenants t
            JOIN users u ON u.tenant_id = t.id
            JOIN roles r ON r.id = u.role_id
            WHERE t.deleted_at IS NULL AND u.deleted_at IS NULL
            ORDER BY t.name, r.sort_order, u.name`);

        const tenants = _.map(_.groupBy(rows, "tenantId"), (users) => ({
            id: users[0].tenantId,
            name: users[0].tenantName,
            isPlatform: Boolean(users[0].isPlatform),
            users: users.map((user) => _.pick(user, ["id", "name", "email", "role", "status"])),
        }));
        return responseHelper.ok(res, _.sortBy(tenants, "name"));
    })
);

/**
 * A session as the chosen user, without their password. Only an active user: switching is not their
 * login, so it never activates them or sets their last login. Logged in the user's tenant.
 */
devRouter.post(
    "/switch-user",
    validate(Joi.object({userId: commonValidation.id.required()})),
    asyncHandler(async (req, res) => {
        const user = await authService.findUser(req.body.userId);
        if (!user) throw ApiError.of(HTTP_RESPONSES.HTTP_NOT_FOUND, "User not found");
        if (user.tenant.status === TENANT_STATUSES.BLOCKED) throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, "This institution is blocked", ERROR_CODES.TENANT_BLOCKED);
        if (user.status !== USER_STATUSES.ACTIVE) throw ApiError.of(HTTP_RESPONSES.HTTP_CONFLICT, `User is ${user.status}`, ERROR_CODES.ACCOUNT_NOT_ACTIVE);

        await auditHelper.write({
            tenantId: user.tenantId,
            module: MODULES.USERS,
            entityType: "user",
            entityId: user.id,
            entityLabel: user.email,
            action: "update",
            changes: {switchedInBy: {from: null, to: `${req.user.name} (${req.user.email}, ${req.user.tenant.name})`}},
        });
        logger.warn({by: req.user.id, to: user.id, tenantId: user.tenantId}, "Switched user");
        // A session of its own, in this browser's cookie; POST /v1/auth/switch-back returns to the staff member's account
        const session = await sessionService.start(user.id, requestMeta(req), {actorUserId: req.user.id});
        return answerSession(res, session, "Switched user");
    })
);

export default devRouter;
