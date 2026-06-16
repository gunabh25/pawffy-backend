const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const {
  getConversations,
  getOrStartConversation,
  getMessages,
  sendMessage,
  markConversationRead,
} = require("../controllers/messageController");

// List all conversations (with unread count + optional ?search=name)
router.get("/conversations", verifyToken, getConversations);

// Start or resume a conversation with a specific user (tap vet profile → open chat)
router.get("/conversation/with/:userId", verifyToken, getOrStartConversation);

// Get all messages in a conversation (paginated, grouped by date)
router.get("/:conversationId", verifyToken, getMessages);

// Send a new message
router.post("/", verifyToken, sendMessage);

// Mark all messages in a conversation as read
router.patch("/:conversationId/read", verifyToken, markConversationRead);

module.exports = router;
