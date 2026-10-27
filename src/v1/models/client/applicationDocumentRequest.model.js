export default (sequelize, DataTypes) => {
  const ApplicationDocumentRequest = sequelize.define(
    "applicationDocumentRequest",
    {
      id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
      applicationId: {type: DataTypes.INTEGER, allowNull: false},
      reviewId: {type: DataTypes.INTEGER, allowNull: true},
      documentTypeIds: {type: DataTypes.JSON, allowNull: false},
      message: {type: DataTypes.TEXT, allowNull: true},
      emailStatus: {type: DataTypes.ENUM("sent", "failed", "not_configured"), allowNull: false},
      requestedBy: {type: DataTypes.INTEGER, allowNull: true},
    },
    {tableName: "application_document_requests", underscored: true, paranoid: true}
  );

  return ApplicationDocumentRequest;
};
