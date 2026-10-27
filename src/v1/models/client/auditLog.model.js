export default (sequelize, DataTypes) => {
  const AuditLog = sequelize.define(
    "auditLog",
    {
      id: {type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true},
      tenantId: {type: DataTypes.INTEGER, allowNull: true},
      userId: {type: DataTypes.INTEGER, allowNull: true},
      userName: {type: DataTypes.STRING(150), allowNull: true},
      module: {type: DataTypes.STRING(50), allowNull: false},
      entityType: {type: DataTypes.STRING(50), allowNull: false},
      entityId: {type: DataTypes.INTEGER, allowNull: true},
      entityLabel: {type: DataTypes.STRING(255), allowNull: true},
      action: {type: DataTypes.ENUM("create", "update", "delete"), allowNull: false},
      changes: {type: DataTypes.JSON, allowNull: true},
      requestId: {type: DataTypes.STRING(128), allowNull: true},
      ipAddress: {type: DataTypes.STRING(45), allowNull: true},
    },
    {tableName: "audit_logs", underscored: true, paranoid: true, updatedAt: false}
  );

  return AuditLog;
};
