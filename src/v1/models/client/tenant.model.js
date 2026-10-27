export default (sequelize, DataTypes) => {
  const Tenant = sequelize.define(
    "tenant",
    {
      id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
      name: {type: DataTypes.STRING(150), allowNull: false},
      code: {type: DataTypes.STRING(20), allowNull: true},
      contactEmail: {type: DataTypes.STRING(255), allowNull: true},
      phone: {type: DataTypes.STRING(30), allowNull: true},
      address: {type: DataTypes.STRING(500), allowNull: true},
      website: {type: DataTypes.STRING(255), allowNull: true},
      logoStorageKey: {type: DataTypes.STRING(500), allowNull: true},
      brandColor: {type: DataTypes.CHAR(7), allowNull: true},
      isPlatform: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false},
      status: {type: DataTypes.ENUM("active", "blocked"), allowNull: false, defaultValue: "active"},
    },
    {tableName: "tenants", underscored: true, paranoid: true}
  );

  return Tenant;
};
