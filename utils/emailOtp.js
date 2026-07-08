const logger = require("./logger");

/**
 * Deliver a 6-digit OTP by email.
 * Prefers Twilio SendGrid (free tier) when SENDGRID_API_KEY is set.
 * Falls back to SMTP when SMTP_HOST/SMTP_USER are configured.
 * Returns { delivered, provider } so callers can decide whether to expose the OTP in non-prod.
 */
async function sendEmailOtp({ to, otp, purpose = "verification" }) {
  const subject = purpose === "email_change"
    ? "Your Pawffy email verification code"
    : "Your Pawffy verification code";
  const html = `
    <p>Your Pawffy verification code is:</p>
    <p style="font-size:24px;font-weight:700;letter-spacing:4px;">${otp}</p>
    <p>This code expires in 10 minutes. If you did not request this, you can ignore this email.</p>
  `;
  const text = `Your Pawffy verification code is ${otp}. It expires in 10 minutes.`;

  if (process.env.SENDGRID_API_KEY) {
    try {
      const sgMail = require("@sendgrid/mail");
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      const from = process.env.SENDGRID_FROM_EMAIL || process.env.SMTP_USER;
      if (!from) {
        logger.error({ event: "SENDGRID_FROM_MISSING" });
        return { delivered: false, provider: "sendgrid" };
      }

      await sgMail.send({
        to,
        from: process.env.SENDGRID_FROM_NAME
          ? { email: from, name: process.env.SENDGRID_FROM_NAME }
          : from,
        subject,
        text,
        html,
      });
      return { delivered: true, provider: "sendgrid" };
    } catch (err) {
      logger.error({
        event: "SENDGRID_OTP_FAILED",
        error: err.message,
        to,
        details: err.response?.body || null,
      });
      return { delivered: false, provider: "sendgrid" };
    }
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    try {
      const nodemailer = require("nodemailer");
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587", 10),
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transporter.sendMail({
        from: `"Pawffy" <${process.env.SMTP_USER}>`,
        to,
        subject,
        text,
        html,
      });
      return { delivered: true, provider: "smtp" };
    } catch (err) {
      logger.error({ event: "SMTP_OTP_FAILED", error: err.message, to });
      return { delivered: false, provider: "smtp" };
    }
  }

  return { delivered: false, provider: null };
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

module.exports = { sendEmailOtp, generateOtp };
