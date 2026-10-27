export default (sequelize, DataTypes) => {
  const ApplicationNote = sequelize.define(
    "applicationNote",
    {
      id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
      tenantId: {type: DataTypes.INTEGER, allowNull: false},
      applicationId: {type: DataTypes.INTEGER, allowNull: false},
      reviewId: {type: DataTypes.INTEGER, allowNull: true},
      note: {type: DataTypes.TEXT, allowNull: false},
      createdBy: {type: DataTypes.INTEGER, allowNull: false},
    },
    {tableName: "application_notes", underscored: true, paranoid: true}
  );

  return ApplicationNote;
};
