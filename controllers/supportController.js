const asyncHandler = require("../middleware/asyncHandler");
const supportService = require("../services/support.service");

exports.createTicket = asyncHandler(async (req, res) => {
  const data = await supportService.createTicket(req.user.id, req.body);
  res.status(201).json({ success: true, message: "Support ticket created", data });
});
