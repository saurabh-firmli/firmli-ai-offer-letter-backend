export default (sequelize, DataTypes) => {
  const LetterTemplate = sequelize.define(
    "letterTemplate",
    {
      id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
      tenantId: {type: DataTypes.INTEGER, allowNull: false},
      name: {type: DataTypes.STRING(150), allowNull: false},
      letterType: {type: DataTypes.ENUM("conditional_offer", "rejection", "manual_review"), allowNull: false},
      subject: {type: DataTypes.STRING(255), allowNull: true},
      referencePrefix: {type: DataTypes.STRING(10), allowNull: false, defaultValue: "LTR"},
      body: {type: DataTypes.TEXT("medium"), allowNull: false},
      signatoryName: {type: DataTypes.STRING(150), allowNull: true},
      signatoryTitle: {type: DataTypes.STRING(150), allowNull: true},
      headerHtml: {type: DataTypes.TEXT, allowNull: true},
      footerHtml: {type: DataTypes.TEXT, allowNull: true},
      status: {type: DataTypes.ENUM("draft", "published"), allowNull: false, defaultValue: "draft"},
    },
    {tableName: "letter_templates", underscored: true, paranoid: true}
  );

  return LetterTemplate;
};
