export default (sequelize, DataTypes) => {
  const AiUsageLog = sequelize.define(
    "aiUsageLog",
    {
      id: {type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true},
      tenantId: {type: DataTypes.INTEGER, allowNull: false},
      applicationId: {type: DataTypes.INTEGER, allowNull: true},
      documentId: {type: DataTypes.INTEGER, allowNull: true},
      assessmentId: {type: DataTypes.INTEGER, allowNull: true},
      operation: {
        type: DataTypes.ENUM("extraction", "extraction_fallback", "document_verification", "assessment", "assessment_escalation"),
        allowNull: false,
      },
      modelId: {type: DataTypes.INTEGER, allowNull: true},
      modelCode: {type: DataTypes.STRING(100), allowNull: false},
      inputTokens: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 0},
      cachedInputTokens: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 0},
      outputTokens: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 0},
      costUsd: {type: DataTypes.DECIMAL(12, 6), allowNull: true},
      durationMs: {type: DataTypes.INTEGER, allowNull: true},
      status: {type: DataTypes.ENUM("success", "failed"), allowNull: false},
      errorMessage: {type: DataTypes.STRING(500), allowNull: true},
      providerRequestId: {type: DataTypes.STRING(128), allowNull: true},
      triggeredBy: {type: DataTypes.INTEGER, allowNull: true},
    },
    {tableName: "ai_usage_logs", underscored: true, paranoid: true, updatedAt: false}
  );

  return AiUsageLog;
};
