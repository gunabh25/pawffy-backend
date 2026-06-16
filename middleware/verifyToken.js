const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");
const logger = require("../utils/logger");

const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ success: false, message: "Authentication required. No token provided." });
    }

    if (!process.env.JWT_SECRET) {
      logger.error({ event: "JWT_SECRET_MISSING" });
      return res.status(500).json({ success: false, message: "Server configuration error" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      const msg = err.name === "TokenExpiredError"
        ? "Session expired. Please log in again."
        : "Invalid token.";
      logger.authFail(err.name, { ip: req.ip, path: req.path });
      return res.status(401).json({ success: false, message: msg });
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });

    if (!user) {
      logger.authFail("USER_NOT_FOUND", { userId: decoded.userId, ip: req.ip });
      return res.status(401).json({ success: false, message: "Account not found." });
    }

    // ── Token version check — invalidates ALL tokens issued before logout/password change ──
    if (user.tokenVersion !== decoded.tokenVersion) {
      logger.authFail("TOKEN_VERSION_MISMATCH", { userId: user.id, ip: req.ip });
      return res.status(401).json({ success: false, message: "Session expired. Please log in again." });
    }

    req.user = user;
    next();
  } catch (err) {
    logger.error({ event: "VERIFY_TOKEN_ERROR", error: err.message });
    return res.status(500).json({ success: false, message: "Authentication error" });
  }
};

module.exports = verifyToken;
