export default (sequelize, DataTypes) => {
  const EmailTemplate = sequelize.define(
    "emailTemplate",
    {
      id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
      tenantId: {type: DataTypes.INTEGER, allowNull: false},
      name: {type: DataTypes.STRING(150), allowNull: false},
      emailType: {
        type: DataTypes.ENUM("conditional_offer", "rejection", "manual_review", "document_request", "custom"),
        allowNull: false,
      },
      subject: {type: DataTypes.STRING(255), allowNull: true},
      cc: {type: DataTypes.STRING(1000), allowNull: true},
      bcc: {type: DataTypes.STRING(1000), allowNull: true},
      body: {type: DataTypes.TEXT("medium"), allowNull: false},
      attachPdfLetter: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false},
      status: {type: DataTypes.ENUM("draft", "published"), allowNull: false, defaultValue: "draft"},
    },
    {tableName: "email_templates", underscored: true, paranoid: true}
  );

  return EmailTemplate;
};
