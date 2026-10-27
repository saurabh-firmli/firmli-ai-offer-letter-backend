export default (sequelize, DataTypes) => {
  const Application = sequelize.define(
    "application",
    {
      id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
      tenantId: {type: DataTypes.INTEGER, allowNull: false},
      applicationNumber: {type: DataTypes.STRING(20), allowNull: false},
      studentId: {type: DataTypes.INTEGER, allowNull: false},
      programId: {type: DataTypes.INTEGER, allowNull: false},
      intakeTerm: {type: DataTypes.ENUM("spring", "summer", "fall", "winter"), allowNull: false},
      intakeYear: {type: DataTypes.SMALLINT, allowNull: false},
      studyMode: {type: DataTypes.ENUM("full_time", "part_time", "online", "hybrid"), allowNull: false},
      applicationDate: {type: DataTypes.DATEONLY, allowNull: false},
      status: {
        type: DataTypes.ENUM("draft", "submitted", "processing", "manual_review", "completed"),
        allowNull: false,
        defaultValue: "draft",
      },
      assessmentStatus: {type: DataTypes.ENUM("pending", "in_progress", "completed", "failed"), allowNull: true},
      outcome: {type: DataTypes.ENUM("conditional_offer", "rejection", "manual_review"), allowNull: true},
      confidence: {type: DataTypes.DECIMAL(3, 2), allowNull: true},
      decisionSource: {type: DataTypes.ENUM("ai", "manual"), allowNull: true},
      decidedBy: {type: DataTypes.INTEGER, allowNull: true},
      decidedAt: {type: DataTypes.DATE, allowNull: true},
      decisionReason: {type: DataTypes.TEXT, allowNull: true},
      assignedOfficerId: {type: DataTypes.INTEGER, allowNull: true},
      eligibilityVersionId: {type: DataTypes.INTEGER, allowNull: true},
      submittedAt: {type: DataTypes.DATE, allowNull: true},
      submittedBy: {type: DataTypes.INTEGER, allowNull: true},
    },
    {tableName: "applications", underscored: true, paranoid: true}
  );

  return Application;
};
