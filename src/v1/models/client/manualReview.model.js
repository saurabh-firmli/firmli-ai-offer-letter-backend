export default (sequelize, DataTypes) => {
  const ManualReview = sequelize.define(
    "manualReview",
    {
      id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
      tenantId: {type: DataTypes.INTEGER, allowNull: false},
      applicationId: {type: DataTypes.INTEGER, allowNull: false},
      status: {type: DataTypes.ENUM("unassigned", "assigned", "in_review", "waiting_documents", "resolved"), allowNull: false, defaultValue: "unassigned"},
      priority: {type: DataTypes.ENUM("low", "normal", "high", "urgent"), allowNull: false, defaultValue: "normal"},
      reason: {type: DataTypes.STRING(500), allowNull: true},
      flags: {type: DataTypes.JSON, allowNull: true},
      queuedAt: {type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW},
      reviewerId: {type: DataTypes.INTEGER, allowNull: true},
      assignedBy: {type: DataTypes.INTEGER, allowNull: true},
      assignedAt: {type: DataTypes.DATE, allowNull: true},
      assignmentNote: {type: DataTypes.TEXT, allowNull: true},
      resolution: {type: DataTypes.ENUM("returned_for_reassessment", "approved", "rejected"), allowNull: true},
      resolutionNote: {type: DataTypes.TEXT, allowNull: true},
      resolvedBy: {type: DataTypes.INTEGER, allowNull: true},
      resolvedAt: {type: DataTypes.DATE, allowNull: true},
    },
    {tableName: "manual_reviews", underscored: true, paranoid: true}
  );

  return ManualReview;
};
