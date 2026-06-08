const prisma = require("../config/prisma");
const asyncHandler = require("../middleware/asyncHandler");
const { v4: uuidv4 } = require("uuid");

exports.chat = asyncHandler(async (req, res) => {
  const { petId, message, sessionId } = req.body;

  if (!message) {
    return res.status(400).json({ success: false, message: "message is required" });
  }

  const sid = sessionId || uuidv4();

  // Stub AI response — replace with actual AI integration (OpenAI, Gemini, etc.)
  const aiResponse = `Thank you for your message about your pet. This is a placeholder AI response. For urgent concerns, please book a vet appointment immediately.`;
  const intent = "general_inquiry";
  const urgencyLevel = message.toLowerCase().match(/emergency|urgent|bleeding|not breathing|seizure/)
    ? "high"
    : "low";

  const conversation = await prisma.aiConversation.create({
    data: {
      userId: req.user.id,
      petId: petId || null,
      sessionId: sid,
      message,
      aiResponse,
      intent,
      urgencyLevel,
    },
  });

  res.status(201).json({
    success: true,
    data: {
      sessionId: sid,
      message: conversation.message,
      aiResponse: conversation.aiResponse,
      intent,
      urgencyLevel,
    },
  });
});

exports.getConversationHistory = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  const conversations = await prisma.aiConversation.findMany({
    where: { userId: req.user.id, sessionId },
    orderBy: { createdAt: "asc" },
  });

  res.json({ success: true, data: conversations });
});

exports.analyzeImage = asyncHandler(async (req, res) => {
  const { petId, uploadedImage } = req.body;

  if (!petId || !uploadedImage) {
    return res.status(400).json({ success: false, message: "petId and uploadedImage are required" });
  }

  const pet = await prisma.pet.findUnique({ where: { id: petId } });
  if (!pet) return res.status(404).json({ success: false, message: "Pet not found" });
  if (pet.ownerId !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  // Stub analysis — replace with actual AI vision model
  const analysis = await prisma.aiImageAnalysis.create({
    data: {
      petId,
      uploadedImage,
      detectedIssue: "No visible issues detected (placeholder)",
      confidenceScore: 0.85,
      aiRecommendation: "Schedule a routine check-up with your vet for a professional assessment.",
      severityLevel: "low",
    },
  });

  res.status(201).json({ success: true, data: analysis });
});

exports.getImageAnalyses = asyncHandler(async (req, res) => {
  const pet = await prisma.pet.findUnique({ where: { id: req.params.petId } });
  if (!pet) return res.status(404).json({ success: false, message: "Pet not found" });

  const analyses = await prisma.aiImageAnalysis.findMany({
    where: { petId: req.params.petId },
    orderBy: { createdAt: "desc" },
  });

  res.json({ success: true, data: analyses });
});
