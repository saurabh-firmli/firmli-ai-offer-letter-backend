export default (sequelize, DataTypes) => {
  const ApplicationEmail = sequelize.define(
    "applicationEmail",
    {
      id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
      tenantId: {type: DataTypes.INTEGER, allowNull: false},
      applicationId: {type: DataTypes.INTEGER, allowNull: true},
      letterId: {type: DataTypes.INTEGER, allowNull: true},
      templateId: {type: DataTypes.INTEGER, allowNull: true},
      emailType: {type: DataTypes.ENUM("conditional_offer", "rejection", "manual_review", "document_request", "custom"), allowNull: false},
      recipient: {type: DataTypes.STRING(255), allowNull: false},
      cc: {type: DataTypes.STRING(1000), allowNull: true},
      bcc: {type: DataTypes.STRING(1000), allowNull: true},
      subject: {type: DataTypes.STRING(255), allowNull: false},
      bodyHtml: {type: DataTypes.TEXT("medium"), allowNull: false},
      bodyText: {type: DataTypes.TEXT("medium"), allowNull: false},
      attachLetter: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false},
      status: {type: DataTypes.ENUM("sending", "sent", "retrying", "failed"), allowNull: false},
      attempts: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 0},
      maxAttempts: {type: DataTypes.INTEGER, allowNull: false},
      lastError: {type: DataTypes.STRING(500), allowNull: true},
      nextRetryAt: {type: DataTypes.DATE, allowNull: true},
      sentAt: {type: DataTypes.DATE, allowNull: true},
      sender: {type: DataTypes.ENUM("custom", "default"), allowNull: true},
      providerMessageId: {type: DataTypes.STRING(255), allowNull: true},
      messageId: {type: DataTypes.STRING(255), allowNull: true},
      fromEmail: {type: DataTypes.STRING(255), allowNull: true},
      replyTo: {type: DataTypes.STRING(255), allowNull: true},
      sentBy: {type: DataTypes.INTEGER, allowNull: true},
    },
    {tableName: "application_emails", underscored: true, paranoid: true}
  );

  return ApplicationEmail;
};
