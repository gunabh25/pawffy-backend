const AppError = require("./errors");
const { isOwnerOrAdmin } = require("./rbac");
const { UUID_PARAM_PATTERN } = require("../constants/security");

/**
 * Reject malformed UUID route params before they hit the database.
 */
function validateUuidParams(...paramNames) {
  return (req, res, next) => {
    for (const name of paramNames) {
      const value = req.params[name];
      if (value && !UUID_PARAM_PATTERN.test(value)) {
        return next(new AppError(`Invalid ${name}`, 400));
      }
    }
    next();
  };
}

/**
 * Require authenticated user to match :param or be admin.
 */
function requireSelfOrAdmin(paramName = "id") {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError("Authentication required", 401));
    }

    const targetId = req.params[paramName];
    if (!targetId) {
      return next(new AppError(`Missing route parameter: ${paramName}`, 400));
    }

    if (!isOwnerOrAdmin(req, targetId)) {
      return next(new AppError("Access denied", 403));
    }

    next();
  };
}

/**
 * Prevent authenticated users from acting on behalf of another user via body fields.
 */
function forbidImpersonation(...fieldNames) {
  return (req, res, next) => {
    if (!req.user) return next();

    for (const field of fieldNames) {
      const value = req.body?.[field];
      if (value && value !== req.user.id) {
        return next(new AppError("Access denied", 403));
      }
    }

    next();
  };
}

module.exports = {
  validateUuidParams,
  requireSelfOrAdmin,
  forbidImpersonation,
};
