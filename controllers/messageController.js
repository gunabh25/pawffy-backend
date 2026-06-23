const asyncHandler = require("../middleware/asyncHandler");
const messageService = require("../services/message.service");

exports.getConversations = asyncHandler(async (req, res) => {
  const data = await messageService.getConversations(req.user.id, req.query.search);
  res.json({ success: true, data });
});

exports.getOrStartConversation = asyncHandler(async (req, res) => {
  const data = await messageService.getOrStartConversation(req.user.id, req.params.userId);
  res.json({ success: true, data });
});

exports.getMessages = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page || "1");
  const limit = parseInt(req.query.limit || "50");
  const result = await messageService.getMessages(req.user.id, req.params.conversationId, { page, limit });
  res.json({ success: true, data: result.data, meta: result.meta });
});

exports.sendMessage = asyncHandler(async (req, res) => {
  const data = await messageService.sendMessage(req.user.id, req.body);
  res.status(201).json({ success: true, data });
});

exports.markConversationRead = asyncHandler(async (req, res) => {
  const count = await messageService.markConversationRead(req.user.id, req.params.conversationId);
  res.json({ success: true, message: `${count} messages marked as read` });
});
