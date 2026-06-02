const Joi = require("joi");

const registerSchema = Joi.object({
  email: Joi.string().email().optional(),
  phoneNumber: Joi.string().min(10).max(15).optional(),
  password: Joi.string().min(8).required(),
  name: Joi.string().trim().min(1).optional(),
  termsAccepted: Joi.boolean().valid(true).required(),
}).or("email", "phoneNumber");

const loginSchema = Joi.object({
  email: Joi.string().email().optional(),
  phoneNumber: Joi.string().min(10).max(15).optional(),
  password: Joi.string().required(),
}).or("email", "phoneNumber");

module.exports = { registerSchema, loginSchema };
