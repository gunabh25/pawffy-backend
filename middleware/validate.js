/**
 * Joi validation middleware factory.
 * Usage: validate(schema) — validates req.body against the schema.
 * Usage: validate(schema, 'query') — validates req.query.
 */
const validate = (schema, source = "body") => (req, res, next) => {
  const { error, value } = schema.validate(req[source], {
    abortEarly: false,   // return all errors, not just the first
    stripUnknown: true,  // remove unknown fields — prevents mass assignment
    convert: true,
  });

  if (error) {
    const messages = error.details.map((d) => d.message.replace(/['"]/g, ""));
    return res.status(400).json({ success: false, message: "Validation failed", errors: messages });
  }

  req[source] = value; // replace with sanitized/coerced value
  next();
};

module.exports = validate;
