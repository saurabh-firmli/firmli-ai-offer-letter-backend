import fs from "node:fs/promises";
import Sequelize from "sequelize";
import config from "../configs/env.config.js";
import logger from "./logger.util.js";

const MODELS_FOLDER = new URL("../models/client/", import.meta.url);

/**
 * Holds `sequelize` and every model from models/client, keyed by model name.
 * Filled by initDatabase; services read models from here, e.g. `databaseModel.offerLetter`.
 */
const databaseModel = {};

export const initDatabase = async () => {
  const sequelize = new Sequelize.Sequelize(config.db.database, config.db.user, config.db.password, {
    host: config.db.host,
    port: config.db.port,
    dialect: config.db.dialect,
    logging: false,
  });
  await sequelize.authenticate();

  // Each models/client/*.model.js default-exports (sequelize, DataTypes) => model
  const files = (await fs.readdir(MODELS_FOLDER)).filter((file) => file.endsWith(".model.js"));
  const models = [];
  for (const file of files) {
    const {default: defineModel} = await import(new URL(file, MODELS_FOLDER).href);
    models.push(defineModel(sequelize, Sequelize.DataTypes));
  }
  models.forEach((model) => (databaseModel[model.name] = model));
  models.forEach((model) => model.associate?.(databaseModel));

  databaseModel.sequelize = sequelize;
  logger.info({models: models.length}, "Database connected.");
};

export const closeDatabase = async () => {
  try {
    await databaseModel.sequelize?.close();
  } catch (err) {
    logger.error({err}, "Error while closing database connection");
  }
};

export default databaseModel;
