const logger = require("./logger");

const DEFAULT_SMS_API_URL = "https://mysmsgate.net/api/v1/send";

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Send a 6-digit OTP by SMS.
 * Keeps OTP verification in *our* backend: we only send the message here.
 *
 * Provider: MySMSGate (free tier / pay-as-you-go).
 */
async function sendSmsOtp({ to, otp, purpose = "login_2fa" }) {
  const apiKey = process.env.MYSMSGATE_API_KEY;
  if (!apiKey) return { delivered: false, provider: null };

  const smsApiUrl = process.env.MYSMSGATE_API_URL || DEFAULT_SMS_API_URL;
  const deviceId = process.env.MYSMSGATE_DEVICE_ID || null;
  const simSlot = process.env.MYSMSGATE_SIM_SLOT;

  const message = `Pawffy code ${otp}`;
  const payload = {
    to,
    message,
    ...(deviceId ? { device_id: deviceId } : {}),
    ...(simSlot !== undefined && simSlot !== "" ? { slot: Number(simSlot) } : {}),
  };

  try {
    const resp = await fetch(smsApiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const bodyText = await resp.text().catch(() => "");
      logger.error(JSON.stringify({
        event: "SMS_OTP_SEND_FAILED",
        status: resp.status,
        response: bodyText?.slice(0, 500) || null,
        to,
        purpose,
        payload: {
          ...payload,
          message: "[redacted]",
        },
      }));
      return { delivered: false, provider: "mysmsgate", error: `HTTP ${resp.status}` };
    }

    // MySMSGate typically returns JSON with a success/message field.
    const data = await resp.json().catch(() => ({}));
    return { delivered: true, provider: "mysmsgate", providerResponse: data || null };
  } catch (err) {
    logger.error(JSON.stringify({ event: "SMS_OTP_SEND_FAILED", error: err.message, to, purpose }));
    return { delivered: false, provider: "mysmsgate", error: err.message };
  }
}

module.exports = { sendSmsOtp, generateOtp };

