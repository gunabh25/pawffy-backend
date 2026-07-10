const rateLimit = require("express-rate-limit");
const logger = require("../utils/logger");

const onLimitReached = (req) => {
  logger.rateLimit({ ip: req.ip, path: req.path, method: req.method });
};

// ─── General API: 120 requests / 15 min per IP ───────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please try again later." },
  handler: (req, res, next, options) => {
    onLimitReached(req);
    res.status(429).json(options.message);
  },
});

// ─── Auth endpoints: 10 attempts / 15 min per IP ────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many login attempts. Please wait 15 minutes." },
  handler: (req, res, next, options) => {
    onLimitReached(req);
    res.status(429).json(options.message);
  },
});

// ─── Payment endpoints: 20 requests / 15 min per IP ─────────────────────────
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many payment requests. Please slow down." },
  handler: (req, res, next, options) => {
    onLimitReached(req);
    res.status(429).json(options.message);
  },
});

// ─── Upload endpoints: 10 uploads / 15 min per IP ────────────────────────────
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many upload requests. Please slow down." },
  handler: (req, res, next, options) => {
    onLimitReached(req);
    res.status(429).json(options.message);
  },
});

// ─── Public read endpoints: 60 requests / 15 min per IP ───────────────────────
const publicReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please try again later." },
  handler: (req, res, next, options) => {
    onLimitReached(req);
    res.status(429).json(options.message);
  },
});

// ─── Write/mutation endpoints: 30 requests / 15 min per IP ────────────────────
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please slow down." },
  handler: (req, res, next, options) => {
    onLimitReached(req);
    res.status(429).json(options.message);
  },
});

module.exports = {
  generalLimiter,
  authLimiter,
  paymentLimiter,
  uploadLimiter,
  publicReadLimiter,
  writeLimiter,
};
