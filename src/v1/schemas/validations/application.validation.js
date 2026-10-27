import Joi from "joi";
import common from "./common.validation.js";
import {APPLICATION_STATUS_LABELS, ASSESSMENT_STATUS_LABELS, DECISION_OUTCOMES, GENDERS, INTAKE_TERMS} from "../../constants/application.constants.js";
import {LETTER_TYPES} from "../../constants/letter-template.constants.js";
import {LETTER_STATUSES} from "../../constants/letter.constants.js";
import {STUDY_MODES} from "../../constants/program.constants.js";

const today = () => new Date().toISOString().slice(0, 10);

const student = {
    firstName: Joi.string().trim().max(100),
    middleName: common.optionalText(100),
    lastName: Joi.string().trim().max(100),
    dateOfBirth: common.dateOnly
        .custom((value, helpers) => (value > today() ? helpers.error("date.future") : value))
        .messages({"date.future": "Date of birth cannot be in the future"}),
    gender: Joi.string().valid(...GENDERS).allow(null, ""),
    nationalityId: common.optionalId,
    residenceCountryId: common.optionalId,
    passportNumber: common.optionalText(50),
    email: common.email,
    phone: common.phone,
    address: common.optionalText(500),
};

const fields = {
    programId: common.id,
    intakeTerm: Joi.string().valid(...INTAKE_TERMS),
    intakeYear: Joi.number().integer().min(2000).max(2100),
    studyMode: Joi.string().valid(...STUDY_MODES),
    applicationDate: common.day,
};

const applicationValidation = {
    create: common.createSchema({
        ...fields,
        student: Joi.object({
            ...student,
            firstName: student.firstName.required(),
            lastName: student.lastName.required(),
            email: student.email.required(),
        }).required(),
        programId: fields.programId.required(),
        intakeTerm: fields.intakeTerm.required(),
        intakeYear: fields.intakeYear.required(),
    }),

    update: common.updateSchema({...fields, student: Joi.object(student).min(1)}),

    list: Joi.object({
        ...common.pagination,
        status: Joi.string().valid(...Object.keys(APPLICATION_STATUS_LABELS)),
        assessmentStatus: Joi.string().valid(...Object.keys(ASSESSMENT_STATUS_LABELS)),
        outcome: Joi.string().valid(...LETTER_TYPES),
        letterStatus: Joi.string().valid("none", LETTER_STATUSES.PENDING_APPROVAL, LETTER_STATUSES.APPROVED, LETTER_STATUSES.REJECTED),
        programId: common.id,
        officerId: common.id,
        intakeTerm: fields.intakeTerm,
        intakeYear: fields.intakeYear,
        submittedFrom: common.day,
        submittedTo: common.day,
        search: common.searchText,
    }),

    submit: Joi.object({
        confirmed: Joi.boolean().valid(true).required().messages({
            "any.only": "Confirm that the information is accurate and the student has consented",
            "any.required": "Confirm that the information is accurate and the student has consented",
        }),
    }),

    officer: Joi.object({officerId: common.id.allow(null).required()}),

    upload: common.createSchema({documentTypeId: common.id.required()}),

    note: Joi.object({note: Joi.string().trim().max(5000).required()}),

    activity: Joi.object({...common.pagination}),

    outcome: Joi.object({
        outcome: Joi.string().valid(...DECISION_OUTCOMES).required(),
        reason: Joi.string().trim().max(2000).required(),
    }),
};

export default applicationValidation;
