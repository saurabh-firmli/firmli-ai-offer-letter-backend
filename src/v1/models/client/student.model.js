export default (sequelize, DataTypes) => {
  const Student = sequelize.define(
    "student",
    {
      id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
      tenantId: {type: DataTypes.INTEGER, allowNull: false},
      firstName: {type: DataTypes.STRING(100), allowNull: false},
      middleName: {type: DataTypes.STRING(100), allowNull: true},
      lastName: {type: DataTypes.STRING(100), allowNull: false},
      dateOfBirth: {type: DataTypes.DATEONLY, allowNull: true},
      gender: {type: DataTypes.ENUM("male", "female", "other", "prefer_not_to_say"), allowNull: true},
      nationalityId: {type: DataTypes.INTEGER, allowNull: true},
      residenceCountryId: {type: DataTypes.INTEGER, allowNull: true},
      passportNumber: {type: DataTypes.STRING(50), allowNull: true},
      email: {type: DataTypes.STRING(255), allowNull: false},
      phone: {type: DataTypes.STRING(30), allowNull: true},
      address: {type: DataTypes.STRING(500), allowNull: true},
    },
    {tableName: "students", underscored: true, paranoid: true}
  );

  return Student;
};
