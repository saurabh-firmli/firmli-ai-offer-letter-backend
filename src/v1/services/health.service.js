import databaseModel from "../utils/database.util.js";

const healthService = {
  getStatus: async () => {
    let database = "not_configured";
    if (databaseModel.sequelize) {
      try {
        await databaseModel.sequelize.authenticate();
        database = "up";
      } catch (error) {
        database = "down";
      }
    }

    return {
      service: "firmli-ai-offer-letter-backend",
      uptime: process.uptime(),
      database,
    };
  },
};

export default healthService;
