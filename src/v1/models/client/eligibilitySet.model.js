export default (sequelize, DataTypes) => {
  const EligibilitySet = sequelize.define(
    "eligibilitySet",
    {
      id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
      tenantId: {type: DataTypes.INTEGER, allowNull: false},
      name: {type: DataTypes.STRING(150), allowNull: false},
      description: {type: DataTypes.TEXT, allowNull: true},
    },
    {tableName: "eligibility_sets", underscored: true, paranoid: true}
  );

  return EligibilitySet;
};
