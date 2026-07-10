const jwt = require("jsonwebtoken");
const { JWT_ALGORITHM } = require("../constants/security");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

/**
 * Sign a JWT. Embeds userId, role, tokenVersion.
 * tokenVersion allows server-side invalidation on logout or password change.
 */
function signToken(user) {
  if (!JWT_SECRET) throw new Error("JWT_SECRET environment variable is missing");

  return jwt.sign(
    {
      userId:       user.id,
      role:         user.role,
      tokenVersion: user.tokenVersion ?? 0,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, algorithm: JWT_ALGORITHM }
  );
}

/**
 * Strip all sensitive fields before sending user data to client.
 */
function sanitizeUser(user) {
  const {
    passwordHash,
    tokenVersion,
    clerkId,
    supabaseId,
    pendingEmail,
    pendingPhone,
    ...safeUser
  } = user;
  return safeUser;
}

module.exports = { signToken, sanitizeUser };
