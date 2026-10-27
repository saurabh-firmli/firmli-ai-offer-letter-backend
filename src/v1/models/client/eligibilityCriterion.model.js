export default (sequelize, DataTypes) => {
  const EligibilityCriterion = sequelize.define(
    "eligibilityCriterion",
    {
      id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
      versionId: {type: DataTypes.INTEGER, allowNull: false},
      name: {type: DataTypes.STRING(150), allowNull: false},
      categoryId: {type: DataTypes.INTEGER, allowNull: false},
      description: {type: DataTypes.TEXT, allowNull: true},
      dataType: {type: DataTypes.ENUM("text", "number", "boolean", "date"), allowNull: false},
      operator: {
        type: DataTypes.ENUM(
          "equal_to",
          "not_equal_to",
          "greater_than",
          "greater_than_or_equal",
          "less_than",
          "less_than_or_equal",
          "between",
          "one_of",
          "contains"
        ),
        allowNull: false,
      },
      unit: {type: DataTypes.STRING(50), allowNull: true},
      requiredValue: {type: DataTypes.STRING(255), allowNull: false},
      evidenceInstructions: {type: DataTypes.TEXT, allowNull: true},
      rejectionReason: {type: DataTypes.STRING(255), allowNull: true},
      isMandatory: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true},
      effectiveDate: {type: DataTypes.DATEONLY, allowNull: true},
      expiryDate: {type: DataTypes.DATEONLY, allowNull: true},
      sortOrder: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 0},
    },
    {tableName: "eligibility_criteria", underscored: true, paranoid: true}
  );

  return EligibilityCriterion;
};
