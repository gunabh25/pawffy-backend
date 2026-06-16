const { createLogger, format, transports } = require("winston");
const path = require("path");

const logDir = path.join(__dirname, "../logs");

// Ensure logs directory exists
const fs = require("fs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const logger = createLogger({
  level: process.env.NODE_ENV === "production" ? "warn" : "info",
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.File({ filename: path.join(logDir, "error.log"), level: "error", maxsize: 5242880, maxFiles: 5 }),
    new transports.File({ filename: path.join(logDir, "security.log"), level: "warn",  maxsize: 5242880, maxFiles: 5 }),
    new transports.File({ filename: path.join(logDir, "combined.log"),               maxsize: 5242880, maxFiles: 5 }),
  ],
});

// In development, also log to console
if (process.env.NODE_ENV !== "production") {
  logger.add(new transports.Console({
    format: format.combine(format.colorize(), format.simple()),
  }));
}

// Security event helpers
logger.security = (event, meta = {}) => logger.warn({ event, ...meta });
logger.authFail  = (reason, meta = {}) => logger.warn({ event: "AUTH_FAIL", reason, ...meta });
logger.rateLimit = (meta = {})         => logger.warn({ event: "RATE_LIMIT_HIT", ...meta });
logger.forbidden = (meta = {})         => logger.warn({ event: "FORBIDDEN_ACCESS", ...meta });

module.exports = logger;
