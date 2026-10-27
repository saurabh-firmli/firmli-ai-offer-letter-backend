export default (sequelize, DataTypes) => {
  const UserSession = sequelize.define(
    "userSession",
    {
      id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
      tenantId: {type: DataTypes.INTEGER, allowNull: false},
      userId: {type: DataTypes.INTEGER, allowNull: false},
      actorUserId: {type: DataTypes.INTEGER, allowNull: true},
      refreshTokenHash: {type: DataTypes.CHAR(64), allowNull: false},
      previousTokenHash: {type: DataTypes.CHAR(64), allowNull: true},
      rotatedAt: {type: DataTypes.DATE, allowNull: true},
      expiresAt: {type: DataTypes.DATE, allowNull: false},
      lastUsedAt: {type: DataTypes.DATE, allowNull: true},
      endedAt: {type: DataTypes.DATE, allowNull: true},
      endReason: {type: DataTypes.STRING(20), allowNull: true},
      userAgent: {type: DataTypes.STRING(255), allowNull: true},
      ipAddress: {type: DataTypes.STRING(45), allowNull: true},
    },
    {tableName: "user_sessions", underscored: true, paranoid: true}
  );

  return UserSession;
};
