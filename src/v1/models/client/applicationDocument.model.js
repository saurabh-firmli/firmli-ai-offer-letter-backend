export default (sequelize, DataTypes) => {
  const ApplicationDocument = sequelize.define(
    "applicationDocument",
    {
      id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
      applicationId: {type: DataTypes.INTEGER, allowNull: false},
      documentTypeId: {type: DataTypes.INTEGER, allowNull: false},
      originalName: {type: DataTypes.STRING(255), allowNull: false},
      storageKey: {type: DataTypes.STRING(500), allowNull: false},
      mimeType: {type: DataTypes.STRING(100), allowNull: false},
      sizeBytes: {type: DataTypes.INTEGER, allowNull: false},
      uploadedBy: {type: DataTypes.INTEGER, allowNull: true},
    },
    {tableName: "application_documents", underscored: true, paranoid: true}
  );

  return ApplicationDocument;
};
