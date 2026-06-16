const logger = require("../utils/logger");

const isProd = process.env.NODE_ENV === "production";

const errorHandler = (err, req, res, next) => {
  // Log full error internally
  logger.error({
    event:  "UNHANDLED_ERROR",
    method: req.method,
    path:   req.path,
    error:  err.message,
    stack:  isProd ? undefined : err.stack,
    userId: req.user?.id,
    ip:     req.ip,
  });

  // ── Prisma errors ──────────────────────────────────────────────────────────
  if (err.code) {
    switch (err.code) {
      case "P2002":
        return res.status(409).json({ success: false, message: "A record with this value already exists." });
      case "P2025":
        return res.status(404).json({ success: false, message: "Record not found." });
      case "P2003":
        return res.status(400).json({ success: false, message: "Referenced record does not exist." });
      case "P2014":
        return res.status(400).json({ success: false, message: "Invalid relation." });
    }
  }

  // ── Multer errors ──────────────────────────────────────────────────────────
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ success: false, message: "File too large. Maximum size is 2MB." });
  }
  if (err.message?.includes("Only JPEG")) {
    return res.status(415).json({ success: false, message: err.message });
  }

  // ── Validation errors ──────────────────────────────────────────────────────
  if (err.isJoi || err.name === "ValidationError") {
    return res.status(400).json({ success: false, message: err.message });
  }

  // ── JWT errors ────────────────────────────────────────────────────────────
  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    return res.status(401).json({ success: false, message: "Invalid or expired token." });
  }

  // ── Stripe errors ─────────────────────────────────────────────────────────
  if (err.type === "StripeCardError") {
    return res.status(402).json({ success: false, message: err.message });
  }
  if (err.type?.startsWith("Stripe")) {
    return res.status(502).json({ success: false, message: "Payment service error. Please try again." });
  }

  // ── Custom status ─────────────────────────────────────────────────────────
  const status = err.status || err.statusCode || 500;

  // In production: never expose stack traces or internal error messages for 5xx
  const message = (status >= 500 && isProd)
    ? "An unexpected error occurred. Please try again later."
    : (err.message || "Internal Server Error");

  res.status(status).json({ success: false, message });
};

module.exports = errorHandler;
