const AppError = require("./errors");
const { filesToDataUrls } = require("../utils/petReportImages");

function parseJsonField(value, fieldName) {
  if (value == null || value === "") return undefined;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new AppError(`Invalid JSON for ${fieldName}`, 400);
  }
}

/**
 * Normalizes multipart/form-data pet report payloads before Joi validation.
 * - Converts uploaded image files to base64 data URLs
 * - Parses location JSON string from form fields
 * - Coerces numeric fields sent as strings
 */
function preparePetReportBody(req, res, next) {
  try {
    if (req.body.location) {
      req.body.location = parseJsonField(req.body.location, "location");
    }

    if (req.body.images) {
      req.body.images = parseJsonField(req.body.images, "images");
    }

    if (req.body.age !== undefined && req.body.age !== "") {
      req.body.age = Number(req.body.age);
    }

    const uploaded = filesToDataUrls(req.files || []);
    if (uploaded.length) {
      req.body.images = uploaded;
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = preparePetReportBody;
