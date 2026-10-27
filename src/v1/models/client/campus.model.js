export default (sequelize, DataTypes) => {
  const Campus = sequelize.define(
    "campus",
    {
      id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
      tenantId: {type: DataTypes.INTEGER, allowNull: false},
      name: {type: DataTypes.STRING(150), allowNull: false},
      cityId: {type: DataTypes.INTEGER, allowNull: true},
    },
    {tableName: "campuses", underscored: true, paranoid: true}
  );

  return Campus;
};
