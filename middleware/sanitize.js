const xss = require("xss");

/**
 * Recursively sanitize all string values in an object against XSS.
 */
function sanitizeValue(value) {
  if (typeof value === "string") return xss(value.trim());
  if (Array.isArray(value))     return value.map(sanitizeValue);
  if (value !== null && typeof value === "object") return sanitizeObject(value);
  return value;
}

function sanitizeObject(obj) {
  const clean = {};
  for (const key of Object.keys(obj)) {
    clean[key] = sanitizeValue(obj[key]);
  }
  return clean;
}

/**
 * Middleware: sanitize req.body, req.query, req.params
 */
const sanitizeInputs = (req, res, next) => {
  if (req.body)   req.body   = sanitizeObject(req.body);
  if (req.query)  req.query  = sanitizeObject(req.query);
  if (req.params) req.params = sanitizeObject(req.params);
  next();
};

module.exports = sanitizeInputs;
