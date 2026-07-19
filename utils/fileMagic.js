const FileType = require("file-type");
const AppError = require("../middleware/errors");
const asyncHandler = require("../middleware/asyncHandler");

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DOCUMENT_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

/**
 * Detect MIME from file magic bytes. Returns null if unknown.
 */
async function detectMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  const result = await FileType.fromBuffer(buffer);
  return result?.mime || null;
}

/**
 * Assert buffer matches an allowed MIME via magic bytes (not client Content-Type).
 * Returns the detected MIME.
 */
async function assertAllowedBuffer(buffer, allowedMimes, { label = "File" } = {}) {
  const detected = await detectMime(buffer);
  if (!detected || !allowedMimes.has(detected)) {
    throw new AppError(
      `${label} type is not allowed or could not be verified`,
      415
    );
  }
  return detected;
}

function collectUploadedFiles(req) {
  const files = [];
  if (req.file) files.push(req.file);
  if (Array.isArray(req.files)) {
    files.push(...req.files);
  } else if (req.files && typeof req.files === "object") {
    for (const value of Object.values(req.files)) {
      if (Array.isArray(value)) files.push(...value);
      else if (value) files.push(value);
    }
  }
  return files;
}

/**
 * Post-multer middleware: verify magic bytes for every uploaded file.
 */
function validateUploadMagic(allowedMimes) {
  const allowed = allowedMimes instanceof Set ? allowedMimes : new Set(allowedMimes);

  return asyncHandler(async (req, res, next) => {
    const files = collectUploadedFiles(req);
    for (const file of files) {
      const detected = await assertAllowedBuffer(file.buffer, allowed, {
        label: file.originalname || "File",
      });
      // Prefer detected MIME over client-supplied Content-Type
      file.mimetype = detected;
    }
    next();
  });
}

module.exports = {
  IMAGE_MIMES,
  DOCUMENT_MIMES,
  detectMime,
  assertAllowedBuffer,
  validateUploadMagic,
};
