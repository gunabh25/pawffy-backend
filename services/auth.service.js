const crypto = require("crypto");
const prisma = require("../config/prisma");
const AppError = require("../middleware/errors");
const { signToken, sanitizeUser } = require("../utils/auth");
const logger = require("../utils/logger");

const EMAIL_OTP_TTL_MS = 10 * 60 * 1000;
const PHONE_OTP_TTL_MS = 10 * 60 * 1000;
const MAX_VERIFICATION_ATTEMPTS = 5;

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

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

async function logout(userId) {
  await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
}

async function requestVendorEmailChange(user, { newEmail }) {
  const normalizedEmail = newEmail.toLowerCase();
  if (user.email === normalizedEmail) {
    throw new AppError("New email must be different from current email", 400);
  }

  await ensureUniqueEmail(normalizedEmail, user.id);

  const otp = generateOtp();
  await prisma.user.update({
    where: { id: user.id },
    data: { pendingEmail: normalizedEmail },
  });
  await createContactVerificationToken(user.id, "email_change", normalizedEmail, otp, EMAIL_OTP_TTL_MS);

  const delivered = await sendEmail({
    to: normalizedEmail,
    subject: "Your Pawffy email verification code",
    html: `
      <p>Your Pawffy verification code is:</p>
      <p style="font-size:24px;font-weight:700;letter-spacing:4px;">${otp}</p>
      <p>This code expires in 10 minutes. If you did not request this, you can ignore this email.</p>
    `,
  });

  const response = {
    message: delivered
      ? "OTP sent to your new email address."
      : "OTP generated. Configure SMTP to deliver email OTPs.",
    provider: delivered ? "smtp" : null,
    delivered,
  };

  if (process.env.NODE_ENV !== "production" && (!delivered || process.env.EXPOSE_OTP_IN_DEV === "true")) {
    response.otp = otp;
  }

  return response;
}

async function verifyVendorEmailChange(userId, { otp, newEmail }) {
  const normalizedEmail = newEmail.toLowerCase();
  const tokenHash = hashVerificationValue(otp);
  const record = await prisma.contactVerificationToken.findFirst({
    where: {
      userId,
      type: "email_change",
      targetValue: normalizedEmail,
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
    if (!freshUser || freshUser.pendingEmail !== normalizedEmail) {
      throw new AppError("Pending email change not found", 400);
    }

    const committed = await tx.user.update({
      where: { id: userId },
      data: {
        email: normalizedEmail,
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

  const otp = generateOtp();
  await prisma.user.update({
    where: { id: user.id },
    data: { pendingPhone: newPhone },
  });
  await createContactVerificationToken(user.id, "phone_update", newPhone, otp, PHONE_OTP_TTL_MS);

  return {
    message: "OTP generated for phone verification. Verify via Supabase phone change in the mobile app, or use the OTP in dev.",
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
  logout,
  requestVendorEmailChange,
  verifyVendorEmailChange,
  requestVendorPhoneUpdate,
  verifyVendorPhoneUpdate,
};
