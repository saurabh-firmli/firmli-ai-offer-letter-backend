import { once } from "node:events";
import { asyncHandler } from "../utils/asyncHandler.js";
import logger from "../utils/logger.util.js";
import responseHelper from "../helpers/response.helper.js";
import reportService from "../services/report.service.js";

const reportController = {
  get: asyncHandler(async (req, res) => {
    const report = await reportService.get(req.query, req.user.tenantId);
    return responseHelper.ok(res, report);
  }),

  // A file download, not the usual JSON answer. Streamed batch by batch: a full network buffer waits
  // ("drain"), a closed download stops the export, and an error after the first bytes cuts the download
  // (the status line is already sent, so it cannot become a JSON error)
  exportCsv: asyncHandler(async (req, res) => {
    const day = new Date().toISOString().slice(0, 10);
    try {
      for await (const chunk of reportService.exportCsv(req.query, req.user.tenantId)) {
        if (res.destroyed) return;
        if (!res.headersSent) res.set({"Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="applications-${day}.csv"`});
        // A closed download never drains, so wait for whichever comes first
        if (!res.write(chunk)) await Promise.race([once(res, "drain"), once(res, "close")]);
      }
      res.end();
    } catch (error) {
      if (!res.headersSent) throw error;
      logger.error({err: error}, "CSV export failed after it started");
      res.destroy(error);
    }
  }),
};

export default reportController;
