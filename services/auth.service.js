const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const prisma = require("../config/prisma");
const AppError = require("../middleware/errors");
const { signToken, sanitizeUser } = require("../utils/auth");
const logger = require("../utils/logger");

const SALT_ROUNDS = 12;
const CONTACT_TOKEN_TTL_MS = 60 * 60 * 1000;
const PHONE_OTP_TTL_MS = 10 * 60 * 1000;
const MAX_VERIFICATION_ATTEMPTS = 5;

function hashVerificationValue(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function sendEmail({ to, subject, html }) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return false;

  try {
    const nodemailer = require("nodemailer");
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transporter.sendMail({
      from: `"Pawffy" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });
    return true;
  } catch (err) {
    logger.error({ event: "EMAIL_SEND_FAILED", error: err.message, to, subject });
    return false;
  }
}

async function invalidateContactVerificationTokens(userId, type) {
  await prisma.contactVerificationToken.updateMany({
    where: { userId, type, usedAt: null },
    data: { usedAt: new Date() },
  });
}

async function createContactVerificationToken(userId, type, targetValue, rawValue, expiresInMs) {
  await invalidateContactVerificationTokens(userId, type);

  const expiresAt = new Date(Date.now() + expiresInMs);
  const tokenHash = hashVerificationValue(rawValue);

  await prisma.contactVerificationToken.create({
    data: {
      userId,
      type,
      targetValue,
      tokenHash,
      expiresAt,
    },
  });

  return { expiresAt };
}

async function verifyPasswordOrThrow(user, password, ip) {
  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    logger.authFail("WRONG_CURRENT_PASSWORD", { userId: user.id, ip });
    throw new AppError("Current password is incorrect", 401);
  }
}

async function ensureUniqueEmail(newEmail, userId) {
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email: newEmail }, { pendingEmail: newEmail }],
      NOT: { id: userId },
    },
    select: { id: true },
  });
  if (existing) throw new AppError("Email is already in use", 409);
}

async function ensureUniquePhone(newPhone, userId) {
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ phone: newPhone }, { pendingPhone: newPhone }],
      NOT: { id: userId },
    },
    select: { id: true },
  });
  if (existing) throw new AppError("Phone number is already in use", 409);
}

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

  const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/reset-password?token=${resetToken}`;
  await sendEmail({
    to: email,
    subject: "Reset your Pawffy password",
    html: `<p>Click the link below to reset your password. It expires in 1 hour.</p><a href="${resetUrl}">${resetUrl}</a>`,
  });

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
  await verifyPasswordOrThrow(user, currentPassword, ip);

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, tokenVersion: { increment: 1 } },
  });

  const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
  return { token: signToken(updatedUser) };
}

async function requestVendorEmailChange(user, { newEmail, password }, ip) {
  const normalizedEmail = newEmail.toLowerCase();
  if (user.email === normalizedEmail) {
    throw new AppError("New email must be different from current email", 400);
  }

  await verifyPasswordOrThrow(user, password, ip);
  await ensureUniqueEmail(normalizedEmail, user.id);

  const verificationToken = crypto.randomBytes(32).toString("hex");
  await prisma.user.update({
    where: { id: user.id },
    data: { pendingEmail: normalizedEmail },
  });
  await createContactVerificationToken(user.id, "email_change", normalizedEmail, verificationToken, CONTACT_TOKEN_TTL_MS);

  const verifyUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/vendor/verify-email-change?token=${verificationToken}`;
  await sendEmail({
    to: normalizedEmail,
    subject: "Verify your new Pawffy vendor email",
    html: `<p>Click the link below to confirm your new email address. It expires in 1 hour.</p><a href="${verifyUrl}">${verifyUrl}</a>`,
  });

  return {
    message: "Verification sent to your new email address.",
    ...(process.env.NODE_ENV !== "production" ? { verificationToken } : {}),
  };
}

async function verifyVendorEmailChange(userId, verificationToken) {
  const tokenHash = hashVerificationValue(verificationToken);
  const record = await prisma.contactVerificationToken.findFirst({
    where: {
      userId,
      type: "email_change",
      tokenHash,
      usedAt: null,
    },
  });

  if (!record || record.expiresAt < new Date()) {
    throw new AppError("Invalid or expired verification token", 400);
  }

  const updatedUser = await prisma.$transaction(async (tx) => {
    const freshUser = await tx.user.findUnique({ where: { id: userId } });
    if (!freshUser || freshUser.pendingEmail !== record.targetValue) {
      throw new AppError("Pending email change not found", 400);
    }

    const committed = await tx.user.update({
      where: { id: userId },
      data: {
        email: record.targetValue,
        pendingEmail: null,
        emailVerifiedAt: new Date(),
        tokenVersion: { increment: 1 },
      },
    });

    await tx.contactVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    return committed;
  });

  return { user: sanitizeUser(updatedUser), token: signToken(updatedUser) };
}

async function requestVendorPhoneUpdate(user, { newPhone }) {
  if (user.phone === newPhone) {
    throw new AppError("New phone number must be different from current phone number", 400);
  }

  await ensureUniquePhone(newPhone, user.id);

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  await prisma.user.update({
    where: { id: user.id },
    data: { pendingPhone: newPhone },
  });
  await createContactVerificationToken(user.id, "phone_update", newPhone, otp, PHONE_OTP_TTL_MS);

  return {
    message: "OTP generated for phone verification.",
    ...(process.env.NODE_ENV !== "production" ? { otp } : {}),
  };
}

async function verifyVendorPhoneUpdate(userId, { otp, newPhone }) {
  const tokenHash = hashVerificationValue(otp);
  const record = await prisma.contactVerificationToken.findFirst({
    where: {
      userId,
      type: "phone_update",
      targetValue: newPhone,
      usedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!record || record.expiresAt < new Date()) {
    throw new AppError("Invalid or expired OTP", 400);
  }

  if (record.attemptCount >= MAX_VERIFICATION_ATTEMPTS) {
    throw new AppError("Too many invalid OTP attempts. Request a new OTP.", 429);
  }

  if (record.tokenHash !== tokenHash) {
    const nextAttempts = record.attemptCount + 1;
    await prisma.contactVerificationToken.update({
      where: { id: record.id },
      data: {
        attemptCount: nextAttempts,
        ...(nextAttempts >= MAX_VERIFICATION_ATTEMPTS ? { usedAt: new Date() } : {}),
      },
    });
    throw new AppError("Invalid OTP", 400);
  }

  const updatedUser = await prisma.$transaction(async (tx) => {
    const freshUser = await tx.user.findUnique({ where: { id: userId } });
    if (!freshUser || freshUser.pendingPhone !== newPhone) {
      throw new AppError("Pending phone update not found", 400);
    }

    const committed = await tx.user.update({
      where: { id: userId },
      data: {
        phone: newPhone,
        pendingPhone: null,
        phoneVerifiedAt: new Date(),
        tokenVersion: { increment: 1 },
      },
    });

    await tx.partnerBusiness.updateMany({
      where: { userId },
      data: { phone: newPhone },
    });

    await tx.contactVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    return committed;
  });

  return { user: sanitizeUser(updatedUser), token: signToken(updatedUser) };
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
  requestVendorEmailChange,
  verifyVendorEmailChange,
  requestVendorPhoneUpdate,
  verifyVendorPhoneUpdate,
};
