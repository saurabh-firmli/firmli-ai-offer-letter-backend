export default (sequelize, DataTypes) => {
  const EligibilitySetVersion = sequelize.define(
    "eligibilitySetVersion",
    {
      id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
      eligibilitySetId: {type: DataTypes.INTEGER, allowNull: false},
      versionNumber: {type: DataTypes.INTEGER, allowNull: false},
      status: {type: DataTypes.ENUM("draft", "published", "archived"), allowNull: false, defaultValue: "draft"},
      publishedAt: {type: DataTypes.DATE, allowNull: true},
    },
    {tableName: "eligibility_set_versions", underscored: true, paranoid: true}
  );

  return EligibilitySetVersion;
};
