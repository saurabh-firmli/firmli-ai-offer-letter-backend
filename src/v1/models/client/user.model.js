import _ from "lodash";

export default (sequelize, DataTypes) => {
  const User = sequelize.define(
    "user",
    {
      id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
      tenantId: {type: DataTypes.INTEGER, allowNull: false},
      name: {type: DataTypes.STRING(150), allowNull: false},
      email: {type: DataTypes.STRING(255), allowNull: false, unique: true},
      passwordHash: {type: DataTypes.STRING(255), allowNull: false},
      roleId: {type: DataTypes.INTEGER, allowNull: false},
      status: {type: DataTypes.ENUM("active", "inactive", "banned", "blocked", "deactivated", "deleted"), allowNull: false, defaultValue: "inactive"},
      lastLoginAt: {type: DataTypes.DATE, allowNull: true},
      tokenVersion: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 0},
      passwordChangedAt: {type: DataTypes.DATE, allowNull: true},
    },
    {tableName: "users", underscored: true, paranoid: true}
  );

  User.prototype.toJSON = function () {
    return _.omit(this.get(), ["passwordHash", "tokenVersion"]);
  };

  return User;
};
