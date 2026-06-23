const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");
const asyncHandler = require("./asyncHandler");
const AppError = require("./errors");
const logger = require("../utils/logger");
const { JWT_ALGORITHM } = require("../constants/security");

const verifyToken = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    throw new AppError("Authentication required. No token provided.", 401);
  }

  if (!process.env.JWT_SECRET) {
    logger.error({ event: "JWT_SECRET_MISSING" });
    throw new AppError("Server configuration error", 500);
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
    });
  } catch (err) {
    logger.authFail(err.name, { ip: req.ip, path: req.path });
    const message = err.name === "TokenExpiredError"
      ? "Session expired. Please log in again."
      : "Invalid token.";
    throw new AppError(message, 401);
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.userId } });

  if (!user) {
    logger.authFail("USER_NOT_FOUND", { userId: decoded.userId, ip: req.ip });
    throw new AppError("Account not found.", 401);
  }

  if (user.tokenVersion !== decoded.tokenVersion) {
    logger.authFail("TOKEN_VERSION_MISMATCH", { userId: user.id, ip: req.ip });
    throw new AppError("Session expired. Please log in again.", 401);
  }

  req.user = user;
  next();
});

module.exports = verifyToken;
