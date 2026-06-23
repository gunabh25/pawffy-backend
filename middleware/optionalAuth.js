const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");
const asyncHandler = require("./asyncHandler");
const { JWT_ALGORITHM } = require("../constants/security");

/**
 * Attach req.user when a valid Bearer token is present.
 * Continues without authentication when token is missing or invalid.
 */
const optionalAuth = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token || !process.env.JWT_SECRET) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
    });

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (user && user.tokenVersion === decoded.tokenVersion) {
      req.user = user;
    }
  } catch {
    // Ignore invalid tokens on optional auth routes
  }

  next();
});

module.exports = optionalAuth;
