import { asyncHandler } from "../utils/asyncHandler.js";
import { HTTP_RESPONSES } from "../constants/http-response-messages.constants.js";
import responseHelper from "../helpers/response.helper.js";
import realtimeHelper from "../helpers/realtime.helper.js";
import authService from "../services/auth.service.js";
import { ERROR_CODES } from "../constants/error-codes.constants.js";

const eventController = {
  // A 60-second ticket for opening the stream
  ticket: asyncHandler(async (req, res) =>
    responseHelper.ok(res, await authService.issueEventsTicket(req.user, req.sessionId))
  ),

  // The stream itself: GET /v1/events?ticket=...; stays open, one "event:" block per update
  stream: asyncHandler(async (req, res) => {
    let session;
    try {
      session = authService.verifyEventsTicket(String(req.query.ticket ?? ""));
    } catch (error) {
      return responseHelper.errorResponse(res, HTTP_RESPONSES.HTTP_UNAUTHORIZED, "Events ticket expired or invalid; ask for a new one", "", ERROR_CODES.EVENTS_TICKET_INVALID);
    }
    const {user, refusal, code} = await authService.sessionUser(session);
    if (refusal) return responseHelper.errorResponse(res, HTTP_RESPONSES.HTTP_UNAUTHORIZED, refusal, "", code);
    return realtimeHelper.open(req, res, user);
  }),
};

export default eventController;
