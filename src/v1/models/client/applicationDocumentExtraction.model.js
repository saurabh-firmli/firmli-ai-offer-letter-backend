export default (sequelize, DataTypes) => {
  const ApplicationDocumentExtraction = sequelize.define(
    "applicationDocumentExtraction",
    {
      id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
      assessmentId: {type: DataTypes.INTEGER, allowNull: true},
      documentId: {type: DataTypes.INTEGER, allowNull: false},
      status: {type: DataTypes.ENUM("completed", "failed", "unsupported"), allowNull: false},
      detectedType: {type: DataTypes.STRING(100), allowNull: true},
      typeMatches: {type: DataTypes.BOOLEAN, allowNull: true},
      fields: {type: DataTypes.JSON, allowNull: true},
      confidence: {type: DataTypes.DECIMAL(3, 2), allowNull: true},
      modelCode: {type: DataTypes.STRING(100), allowNull: true},
      errorMessage: {type: DataTypes.STRING(500), allowNull: true},
      requestedBy: {type: DataTypes.INTEGER, allowNull: true},
    },
    {tableName: "application_document_extractions", underscored: true, paranoid: true}
  );

  return ApplicationDocumentExtraction;
};
