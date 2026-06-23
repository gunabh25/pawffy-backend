const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const validate = require("../middleware/validate");
const { validateUuidParams } = require("../middleware/accessControl");
const { writeLimiter } = require("../middleware/rateLimiter");
const v = require("../validators");
const { getConversations, getOrStartConversation, getMessages, sendMessage, markConversationRead } = require("../controllers/messageController");

router.get  ("/conversations",             verifyToken, getConversations);
router.get  ("/conversation/with/:userId", verifyToken, validateUuidParams("userId"), getOrStartConversation);
router.get  ("/:conversationId",           verifyToken, validateUuidParams("conversationId"), getMessages);
router.post ("/",                          verifyToken, writeLimiter, validate(v.sendMessageSchema), sendMessage);
router.patch("/:conversationId/read",      verifyToken, validateUuidParams("conversationId"), markConversationRead);

module.exports = router;
