export default (sequelize, DataTypes) => {
  const ApplicationAssessment = sequelize.define(
    "applicationAssessment",
    {
      id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
      tenantId: {type: DataTypes.INTEGER, allowNull: false},
      applicationId: {type: DataTypes.INTEGER, allowNull: false},
      eligibilityVersionId: {type: DataTypes.INTEGER, allowNull: false},
      status: {type: DataTypes.ENUM("in_progress", "completed", "failed"), allowNull: false, defaultValue: "in_progress"},
      outcome: {type: DataTypes.ENUM("conditional_offer", "rejection", "manual_review"), allowNull: true},
      confidence: {type: DataTypes.DECIMAL(3, 2), allowNull: true},
      summary: {type: DataTypes.STRING(1000), allowNull: true},
      flags: {type: DataTypes.JSON, allowNull: true},
      escalated: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false},
      errorMessage: {type: DataTypes.STRING(500), allowNull: true},
      triggeredBy: {type: DataTypes.INTEGER, allowNull: true},
      startedAt: {type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW},
      completedAt: {type: DataTypes.DATE, allowNull: true},
    },
    {tableName: "application_assessments", underscored: true, paranoid: true}
  );

  return ApplicationAssessment;
};
