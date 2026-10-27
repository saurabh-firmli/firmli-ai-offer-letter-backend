export default (sequelize, DataTypes) => {
  const EligibilityDocumentRequirement = sequelize.define(
    "eligibilityDocumentRequirement",
    {
      id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
      versionId: {type: DataTypes.INTEGER, allowNull: false},
      documentTypeId: {type: DataTypes.INTEGER, allowNull: false},
      customLabel: {type: DataTypes.STRING(150), allowNull: true},
      instructions: {type: DataTypes.STRING(500), allowNull: true},
      isRequired: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true},
      sortOrder: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 0},
    },
    {tableName: "eligibility_document_requirements", underscored: true, paranoid: true}
  );

  return EligibilityDocumentRequirement;
};
