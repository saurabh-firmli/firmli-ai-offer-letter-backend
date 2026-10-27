export default (sequelize, DataTypes) => {
  const ApplicationLetter = sequelize.define(
    "applicationLetter",
    {
      id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
      tenantId: {type: DataTypes.INTEGER, allowNull: false},
      applicationId: {type: DataTypes.INTEGER, allowNull: false},
      assessmentId: {type: DataTypes.INTEGER, allowNull: true},
      templateId: {type: DataTypes.INTEGER, allowNull: true},
      letterType: {type: DataTypes.ENUM("conditional_offer", "rejection", "manual_review"), allowNull: false},
      version: {type: DataTypes.INTEGER, allowNull: false},
      referenceNumber: {type: DataTypes.STRING(40), allowNull: false},
      subject: {type: DataTypes.STRING(255), allowNull: true},
      headerHtml: {type: DataTypes.TEXT, allowNull: true},
      bodyHtml: {type: DataTypes.TEXT("medium"), allowNull: false},
      footerHtml: {type: DataTypes.TEXT, allowNull: true},
      status: {type: DataTypes.ENUM("pending_approval", "approved", "rejected", "superseded"), allowNull: false},
      pdfStorageKey: {type: DataTypes.STRING(500), allowNull: false},
      pdfSizeBytes: {type: DataTypes.INTEGER, allowNull: false},
      generatedBy: {type: DataTypes.INTEGER, allowNull: true},
      reviewedBy: {type: DataTypes.INTEGER, allowNull: true},
      reviewedAt: {type: DataTypes.DATE, allowNull: true},
      reviewNote: {type: DataTypes.TEXT, allowNull: true},
    },
    {tableName: "application_letters", underscored: true, paranoid: true}
  );

  return ApplicationLetter;
};
