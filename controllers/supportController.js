const asyncHandler = require("../middleware/asyncHandler");
const supportService = require("../services/support.service");

exports.createTicket = asyncHandler(async (req, res) => {
  const data = await supportService.createTicket(req.user.id, req.body, req.file);
  res.status(201).json({ success: true, message: "Support message sent successfully", data });
});

exports.listMyTickets = asyncHandler(async (req, res) => {
  const data = await supportService.listMyTickets(req.user.id);
  res.json({ success: true, data });
});
