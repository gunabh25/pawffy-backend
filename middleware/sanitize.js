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
  const skipKeys = new Set(["profileImage", "imageUrl", "reportUrl"]);

  const sanitizeObjectSkipBinary = (obj) => {
    const clean = {};
    for (const key of Object.keys(obj)) {
      if (skipKeys.has(key) && typeof obj[key] === "string") {
        clean[key] = obj[key];
      } else {
        clean[key] = sanitizeValue(obj[key]);
      }
    }
    return clean;
  };

  if (req.body) req.body = sanitizeObjectSkipBinary(req.body);
  if (req.query) req.query = sanitizeObjectSkipBinary(req.query);
  if (req.params) req.params = sanitizeObjectSkipBinary(req.params);
  next();
};

module.exports = sanitizeInputs;
