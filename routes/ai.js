const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const {
  chat,
  getMySessions,
  getConversationHistory,
  getTriageSummary,
  deleteSession,
  analyzeImage,
  getImageAnalyses,
} = require("../controllers/aiController");

// Chat
router.post("/chat",                verifyToken, chat);
router.get("/sessions",             verifyToken, getMySessions);
router.get("/chat/:sessionId",      verifyToken, getConversationHistory);
router.get("/triage/:sessionId",    verifyToken, getTriageSummary);
router.delete("/chat/:sessionId",   verifyToken, deleteSession);

// Image analysis
router.post("/analyze-image",              verifyToken, analyzeImage);
router.get("/image-analyses/:petId",       verifyToken, getImageAnalyses);

module.exports = router;
