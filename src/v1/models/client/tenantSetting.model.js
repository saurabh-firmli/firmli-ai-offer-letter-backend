export default (sequelize, DataTypes) => {
  const TenantSetting = sequelize.define(
    "tenantSetting",
    {
      id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
      tenantId: {type: DataTypes.INTEGER, allowNull: false},
      autoAssessment: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true},
      autoLetterGeneration: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true},
      autoEmailDispatch: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false},
      autoApproveOffers: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false},
      autoApproveRejections: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false},
      requireRejectionApproval: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true},
      requireManualReviewEdgeCases: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true},
      flagLowConfidence: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true},
      flagMissingDocuments: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true},
      offerConfidenceThreshold: {type: DataTypes.DECIMAL(3, 2), allowNull: false, defaultValue: 0.85},
      rejectionConfidenceThreshold: {type: DataTypes.DECIMAL(3, 2), allowNull: false, defaultValue: 0.9},
      defaultReviewerId: {type: DataTypes.INTEGER, allowNull: true},
      emailMaxRetries: {type: DataTypes.TINYINT, allowNull: false, defaultValue: 3},
      smtpEnabled: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false},
      smtpHost: {type: DataTypes.STRING(255), allowNull: true},
      smtpPort: {type: DataTypes.INTEGER, allowNull: true},
      smtpSecure: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false},
      smtpUser: {type: DataTypes.STRING(255), allowNull: true},
      smtpPasswordEncrypted: {type: DataTypes.TEXT, allowNull: true},
      smtpFromEmail: {type: DataTypes.STRING(255), allowNull: true},
      smtpFromName: {type: DataTypes.STRING(150), allowNull: true},
      extractionModelId: {type: DataTypes.INTEGER, allowNull: false},
      extractionFallbackModelId: {type: DataTypes.INTEGER, allowNull: false},
      assessmentModelId: {type: DataTypes.INTEGER, allowNull: false},
      assessmentEscalationModelId: {type: DataTypes.INTEGER, allowNull: false},
      verifyDocumentType: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true},
      extractionPrompt: {type: DataTypes.TEXT, allowNull: true},
      assessmentPrompt: {type: DataTypes.TEXT, allowNull: true},
      openaiApiKeyEncrypted: {type: DataTypes.TEXT, allowNull: true},
      openaiApiKeyLast4: {type: DataTypes.STRING(4), allowNull: true},
    },
    {tableName: "tenant_settings", underscored: true, paranoid: true}
  );

  return TenantSetting;
};
