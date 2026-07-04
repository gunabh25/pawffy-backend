const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const prisma = require("../config/prisma");
const AppError = require("../middleware/errors");
const { signToken, sanitizeUser } = require("../utils/auth");
const logger = require("../utils/logger");

const SALT_ROUNDS = 12;

async function register({ email, phoneNumber, password, name }) {
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        ...(email ? [{ email }] : []),
        ...(phoneNumber ? [{ phone: phoneNumber }] : []),
      ],
    },
  });

  if (existingUser) {
    throw new AppError("User already exists with this email or phone number", 409);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { email: email || null, phone: phoneNumber || null, passwordHash, name: name || null },
  });

  return { user: sanitizeUser(user), token: signToken(user) };
}

async function registerVendor({ email, password, name, acceptTerms }) {
  if (!acceptTerms) {
    throw new AppError("You must agree to the Terms & Conditions", 400);
  }

  const existingUser = await prisma.user.findFirst({
    where: { email },
  });

  if (existingUser) {
    throw new AppError("User already exists with this email", 409);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        passwordHash,
        name: name || null,
        role: "partner",
      },
    });

    await tx.partnerBusiness.create({
      data: {
        userId: created.id,
        contactName: name || null,
        termsAcceptedAt: new Date(),
        onboardingStep: "business",
        verificationStatus: "incomplete",
      },
    });

    return created;
  });

  return { user: sanitizeUser(user), token: signToken(user) };
}

async function loginVendor({ email, password }, ip) {
  const result = await login({ email, password }, ip);
  if (result.user.role !== "partner") {
    throw new AppError("This account is not a vendor account", 403);
  }
  return result;
}

async function login({ email, phoneNumber, password }, ip) {
  const user = await prisma.user.findFirst({ where: email ? { email } : { phone: phoneNumber } });

  if (!user) throw new AppError("Invalid email/phone or password", 401);

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  if (!isValidPassword) {
    logger.authFail("INVALID_PASSWORD", { identifier: email || phoneNumber, ip });
    throw new AppError("Invalid email/phone or password", 401);
  }

  return { user: sanitizeUser(user), token: signToken(user) };
}

async function logout(userId) {
  await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
}

async function forgotPassword(email) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return { message: "If that email exists, a reset link has been sent.", data: {} };
  }

  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, used: false },
    data: { used: true },
  });

  const resetToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: { userId: user.id, token: resetToken, expiresAt },
  });

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

  const data = process.env.NODE_ENV !== "production" ? { resetToken } : {};
  return { message: "If that email exists, a reset link has been sent.", data };
}

async function resetPassword({ token, newPassword }) {
  const resetRecord = await prisma.passwordResetToken.findUnique({ where: { token } });

  if (!resetRecord || resetRecord.used || resetRecord.expiresAt < new Date()) {
    throw new AppError("Invalid or expired reset token", 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetRecord.userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    }),
    prisma.passwordResetToken.update({ where: { id: resetRecord.id }, data: { used: true } }),
  ]);
}

async function changePassword(user, { currentPassword, newPassword }, ip) {
  const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValid) {
    logger.authFail("WRONG_CURRENT_PASSWORD", { userId: user.id, ip });
    throw new AppError("Current password is incorrect", 401);
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, tokenVersion: { increment: 1 } },
  });

  const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
  return { token: signToken(updatedUser) };
}

module.exports = {
  register,
  registerVendor,
  login,
  loginVendor,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
};
