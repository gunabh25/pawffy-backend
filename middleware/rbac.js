const logger = require("../utils/logger");

/**
 * Role-Based Access Control middleware.
 * Usage: requireRole("admin")  or  requireRole("admin", "partner")
 */
const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  if (!allowedRoles.includes(req.user.role)) {
    logger.forbidden({ userId: req.user.id, role: req.user.role, required: allowedRoles, path: req.path });
    return res.status(403).json({
      success: false,
      message: `Access denied. Required role: ${allowedRoles.join(" or ")}`,
    });
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
