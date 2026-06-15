const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { getConversations, getMessages, sendMessage } = require("../controllers/messageController");

router.get("/conversations", verifyToken, getConversations);
router.get("/:conversationId", verifyToken, getMessages);
router.post("/", verifyToken, sendMessage);

module.exports = router;
