const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const prisma = require("../config/prisma");
const asyncHandler = require("../middleware/asyncHandler");
const { signToken, sanitizeUser } = require("../utils/auth");
const logger = require("../utils/logger");

const SALT_ROUNDS = 12;

// ─── Register ─────────────────────────────────────────────────────────────────
exports.register = asyncHandler(async (req, res) => {
  const { email, phoneNumber, password, name } = req.body; // already validated by middleware

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        ...(email ? [{ email }] : []),
        ...(phoneNumber ? [{ phone: phoneNumber }] : []),
      ],
    },
  });

  if (existingUser) {
    return res.status(409).json({ success: false, message: "User already exists with this email or phone number" });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { email: email || null, phone: phoneNumber || null, passwordHash, name: name || null },
  });

  const token = signToken(user);
  res.status(201).json({ success: true, message: "User registered successfully", data: { user: sanitizeUser(user), token } });
});

// ─── Login ────────────────────────────────────────────────────────────────────
exports.login = asyncHandler(async (req, res) => {
  const { email, phoneNumber, password } = req.body;
  const user = await prisma.user.findFirst({ where: email ? { email } : { phone: phoneNumber } });

  if (!user) return res.status(401).json({ success: false, message: "Invalid email/phone or password" });

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  if (!isValidPassword) {
    logger.authFail("INVALID_PASSWORD", { identifier: email || phoneNumber, ip: req.ip });
    return res.status(401).json({ success: false, message: "Invalid email/phone or password" });
  }

  const token = signToken(user);
  res.status(200).json({ success: true, message: "Login successful", data: { user: sanitizeUser(user), token } });
});

// ─── Get Me ───────────────────────────────────────────────────────────────────
exports.getMe = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: sanitizeUser(req.user) });
});

// ─── Logout ───────────────────────────────────────────────────────────────────
// Increments tokenVersion — invalidates ALL tokens ever issued for this user.
exports.logout = asyncHandler(async (req, res) => {
  await prisma.user.update({
    where: { id: req.user.id },
    data: { tokenVersion: { increment: 1 } },
  });
  res.status(200).json({ success: true, message: "Logged out successfully." });
});

// ─── Forgot Password ──────────────────────────────────────────────────────────
exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: "email is required" });

  const user = await prisma.user.findUnique({ where: { email } });

  // Always return success to prevent email enumeration
  if (!user) {
    return res.status(200).json({ success: true, message: "If that email exists, a reset link has been sent." });
  }

  // Invalidate any existing tokens
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, used: false },
    data: { used: true },
  });

  const resetToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.passwordResetToken.create({
    data: { userId: user.id, token: resetToken, expiresAt },
  });

  // Send email if SMTP is configured
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    try {
      const nodemailer = require("nodemailer");
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587"),
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/reset-password?token=${resetToken}`;
      await transporter.sendMail({
        from: `"Pawffy" <${process.env.SMTP_USER}>`,
        to: email,
        subject: "Reset your Pawffy password",
        html: `<p>Click the link below to reset your password. It expires in 1 hour.</p><a href="${resetUrl}">${resetUrl}</a>`,
      });
    } catch (err) {
      console.error("Email send failed:", err.message);
    }
  }

  // In development/no SMTP — return token directly for testing
  const responseData = process.env.NODE_ENV !== "production"
    ? { resetToken }
    : {};

  res.status(200).json({ success: true, message: "If that email exists, a reset link has been sent.", data: responseData });
});

// ─── Reset Password ───────────────────────────────────────────────────────────
exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ success: false, message: "token and newPassword are required" });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
  }

  const resetRecord = await prisma.passwordResetToken.findUnique({ where: { token } });

  if (!resetRecord || resetRecord.used || resetRecord.expiresAt < new Date()) {
    return res.status(400).json({ success: false, message: "Invalid or expired reset token" });
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await prisma.$transaction([
    // Increment tokenVersion to invalidate all existing sessions
    prisma.user.update({ where: { id: resetRecord.userId }, data: { passwordHash, tokenVersion: { increment: 1 } } }),
    prisma.passwordResetToken.update({ where: { id: resetRecord.id }, data: { used: true } }),
  ]);

  res.status(200).json({ success: true, message: "Password reset successfully. Please login with your new password." });
});

// ─── Change Password ──────────────────────────────────────────────────────────
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const isValid = await bcrypt.compare(currentPassword, req.user.passwordHash);
  if (!isValid) {
    logger.authFail("WRONG_CURRENT_PASSWORD", { userId: req.user.id, ip: req.ip });
    return res.status(401).json({ success: false, message: "Current password is incorrect" });
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  // Increment tokenVersion to invalidate all existing sessions (force re-login on other devices)
  await prisma.user.update({
    where: { id: req.user.id },
    data: { passwordHash, tokenVersion: { increment: 1 } },
  });

  const updatedUser = await prisma.user.findUnique({ where: { id: req.user.id } });
  const newToken = signToken(updatedUser); // issue fresh token for current session

  res.status(200).json({ success: true, message: "Password changed. All other sessions have been logged out.", data: { token: newToken } });
});
