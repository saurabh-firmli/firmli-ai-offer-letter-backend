export default (sequelize, DataTypes) => {
  const TenantRolePermission = sequelize.define(
    "tenantRolePermission",
    {
      id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
      tenantId: {type: DataTypes.INTEGER, allowNull: false},
      roleId: {type: DataTypes.INTEGER, allowNull: false},
      moduleId: {type: DataTypes.INTEGER, allowNull: false},
      canCreate: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false},
      canRead: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false},
      canUpdate: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false},
      canDelete: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false},
    },
    {tableName: "tenant_role_permissions", underscored: true, paranoid: true}
  );

  return TenantRolePermission;
};
