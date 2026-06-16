const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const validate = require("../middleware/validate");
const v = require("../models/validators");
const { getConversations, getOrStartConversation, getMessages, sendMessage, markConversationRead } = require("../controllers/messageController");

router.get  ("/conversations",             verifyToken,                                getConversations);
router.get  ("/conversation/with/:userId", verifyToken,                                getOrStartConversation);
router.get  ("/:conversationId",           verifyToken,                                getMessages);
router.post ("/",                          verifyToken, validate(v.sendMessageSchema), sendMessage);
router.patch("/:conversationId/read",      verifyToken,                                markConversationRead);

module.exports = router;
