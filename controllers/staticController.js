const asyncHandler = require("../middleware/asyncHandler");

const TERMS_CONTENT = `# Terms and Conditions

By using Pawffy, you agree to provide accurate account information, use the platform lawfully, and honor confirmed bookings and payments.

Vendors are responsible for maintaining accurate service listings, availability, and timely communication with customers.
`;

const PRIVACY_CONTENT = `# Privacy Policy

Pawffy stores account, booking, and communication data required to provide the platform experience.

We use this information to authenticate users, process bookings and payments, surface notifications, and improve platform operations.
`;

exports.getTerms = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { type: "markdown", content: TERMS_CONTENT } });
});

exports.getPrivacy = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { type: "markdown", content: PRIVACY_CONTENT } });
});
