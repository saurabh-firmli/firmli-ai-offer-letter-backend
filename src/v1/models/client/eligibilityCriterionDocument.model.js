export default (sequelize, DataTypes) => {
  const EligibilityCriterionDocument = sequelize.define(
    "eligibilityCriterionDocument",
    {
      id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
      criterionId: {type: DataTypes.INTEGER, allowNull: false},
      documentTypeId: {type: DataTypes.INTEGER, allowNull: false},
    },
    {tableName: "eligibility_criterion_documents", underscored: true, paranoid: true}
  );

  return EligibilityCriterionDocument;
};
