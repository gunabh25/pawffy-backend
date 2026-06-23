const logger = require("../utils/logger");
const AppError = require("./errors");

const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return next(new AppError("Authentication required", 401));
  }

  if (!allowedRoles.includes(req.user.role)) {
    logger.forbidden({ userId: req.user.id, role: req.user.role, required: allowedRoles, path: req.path });
    return next(new AppError(`Access denied. Required role: ${allowedRoles.join(" or ")}`, 403));
  }

  next();
};

/**
 * Ownership check — ensures the authenticated user owns the resource.
 * Usage: requireOwnership(req, resourceUserId)
 * Returns true if owner OR admin, false otherwise.
 */
const isOwnerOrAdmin = (req, resourceUserId) => {
  return req.user && (req.user.id === resourceUserId || req.user.role === "admin");
};

module.exports = { requireRole, isOwnerOrAdmin };
