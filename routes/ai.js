const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { chat, getConversationHistory, analyzeImage, getImageAnalyses } = require("../controllers/aiController");

router.post("/chat", verifyToken, chat);
router.get("/chat/:sessionId", verifyToken, getConversationHistory);
router.post("/analyze-image", verifyToken, analyzeImage);
router.get("/image-analyses/:petId", verifyToken, getImageAnalyses);

module.exports = router;
