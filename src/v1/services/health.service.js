import databaseModel from "../utils/database.util.js";
import queueHelper from "../helpers/queue.helper.js";

const healthService = {
    getStatus: async () => ({
        service: "firmli-ai-offer-letter-backend",
        uptime: process.uptime(),
        database: await healthService.databaseStatus(),
        queue: await queueHelper.status(),
    }),

    databaseStatus: async () => {
        if (!databaseModel.sequelize) return "not_configured";
        try {
            await databaseModel.sequelize.authenticate();
            return "up";
        } catch (error) {
            return "down";
        }
    },
};

export default healthService;
