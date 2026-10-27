export default (sequelize, DataTypes) => {
  const PasswordReset = sequelize.define(
    "passwordReset",
    {
      id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
      tenantId: {type: DataTypes.INTEGER, allowNull: false},
      userId: {type: DataTypes.INTEGER, allowNull: false},
      tokenHash: {type: DataTypes.CHAR(64), allowNull: false},
      expiresAt: {type: DataTypes.DATE, allowNull: false},
      usedAt: {type: DataTypes.DATE, allowNull: true},
      ipAddress: {type: DataTypes.STRING(45), allowNull: true},
    },
    {tableName: "password_resets", underscored: true, paranoid: true}
  );

  return PasswordReset;
};
