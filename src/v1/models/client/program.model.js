export default (sequelize, DataTypes) => {
  const Program = sequelize.define(
    "program",
    {
      id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
      tenantId: {type: DataTypes.INTEGER, allowNull: false},
      name: {type: DataTypes.STRING(150), allowNull: false},
      code: {type: DataTypes.STRING(50), allowNull: false},
      awardLevel: {type: DataTypes.STRING(100), allowNull: true},
      campusId: {type: DataTypes.INTEGER, allowNull: true},
      eligibilitySetId: {type: DataTypes.INTEGER, allowNull: true},
      duration: {type: DataTypes.STRING(50), allowNull: true},
      studyMode: {type: DataTypes.ENUM("full_time", "part_time", "online", "hybrid"), allowNull: false, defaultValue: "full_time"},
      applicationDeadline: {type: DataTypes.DATEONLY, allowNull: true},
      status: {type: DataTypes.ENUM("draft", "active", "inactive", "archived"), allowNull: false, defaultValue: "draft"},
      description: {type: DataTypes.TEXT, allowNull: true},

      conditionalOfferTemplateId: {type: DataTypes.INTEGER, allowNull: true},
      rejectionTemplateId: {type: DataTypes.INTEGER, allowNull: true},
      manualReviewTemplateId: {type: DataTypes.INTEGER, allowNull: true},

      offerEmailTemplateId: {type: DataTypes.INTEGER, allowNull: true},
      rejectionEmailTemplateId: {type: DataTypes.INTEGER, allowNull: true},
    },
    {tableName: "programs", underscored: true, paranoid: true}
  );

  return Program;
};
