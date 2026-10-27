export default (sequelize, DataTypes) => {
  const ApplicationAssessmentCriterion = sequelize.define(
    "applicationAssessmentCriterion",
    {
      id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
      assessmentId: {type: DataTypes.INTEGER, allowNull: false},
      criterionId: {type: DataTypes.INTEGER, allowNull: false},
      criterionName: {type: DataTypes.STRING(150), allowNull: false},
      isMandatory: {type: DataTypes.BOOLEAN, allowNull: false},
      result: {type: DataTypes.ENUM("met", "not_met", "unclear"), allowNull: false},
      foundValue: {type: DataTypes.STRING(255), allowNull: true},
      evidence: {type: DataTypes.TEXT, allowNull: true},
      sourceDocumentId: {type: DataTypes.INTEGER, allowNull: true},
      confidence: {type: DataTypes.DECIMAL(3, 2), allowNull: true},
      reasoning: {type: DataTypes.TEXT, allowNull: true},
      overrideResult: {type: DataTypes.ENUM("met", "not_met"), allowNull: true},
      overrideNote: {type: DataTypes.TEXT, allowNull: true},
      overriddenBy: {type: DataTypes.INTEGER, allowNull: true},
      overriddenAt: {type: DataTypes.DATE, allowNull: true},
    },
    {tableName: "application_assessment_criteria", underscored: true, paranoid: true}
  );

  return ApplicationAssessmentCriterion;
};
