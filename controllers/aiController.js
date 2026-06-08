const { v4: uuidv4 } = require("uuid");
const prisma = require("../config/prisma");
const asyncHandler = require("../middleware/asyncHandler");
const { chatCompletion, analyzeImage, generateTriageSummary, buildSystemPrompt } = require("../services/openaiService");

// ─── Helper: load pet with health context ─────────────────────────────────────
async function loadPetContext(petId) {
  if (!petId) return { pet: null, vaccinations: [], medicalRecords: [] };

  const pet = await prisma.pet.findUnique({ where: { id: petId } });
  if (!pet) return { pet: null, vaccinations: [], medicalRecords: [] };

  const [vaccinations, medicalRecords] = await Promise.all([
    prisma.vaccination.findMany({
      where: { petId },
      orderBy: { vaccinationDate: "desc" },
      take: 5,
    }),
    prisma.medicalRecord.findMany({
      where: { petId },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { diagnosis: true, allergies: true, createdAt: true },
    }),
  ]);

  return { pet, vaccinations, medicalRecords };
}

// ─── POST /api/ai/chat ─────────────────────────────────────────────────────────
exports.chat = asyncHandler(async (req, res) => {
  const { petId, message, sessionId } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, message: "message is required" });
  }

  // Validate pet ownership if petId provided
  if (petId) {
    const pet = await prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) return res.status(404).json({ success: false, message: "Pet not found" });
    if (pet.ownerId !== req.user.id) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
  }

  const sid = sessionId || uuidv4();

  // Load pet context and conversation history in parallel
  const [{ pet, vaccinations, medicalRecords }, history] = await Promise.all([
    loadPetContext(petId),
    prisma.aiConversation.findMany({
      where: { userId: req.user.id, sessionId: sid },
      orderBy: { createdAt: "asc" },
      take: 10, // last 10 exchanges for context window
      select: { message: true, aiResponse: true },
    }),
  ]);

  // Build system prompt with full pet health context
  const systemPrompt = buildSystemPrompt(pet, vaccinations, medicalRecords);

  // Call OpenAI
  const { cleanResponse, urgencyLevel, intent } = await chatCompletion(
    systemPrompt,
    history,
    message.trim()
  );

  // Persist conversation turn
  const conversation = await prisma.aiConversation.create({
    data: {
      userId: req.user.id,
      petId: petId || null,
      sessionId: sid,
      message: message.trim(),
      aiResponse: cleanResponse,
      intent,
      urgencyLevel,
    },
  });

  // Auto-create urgent notification if critical/high
  if (urgencyLevel === "high" || urgencyLevel === "critical") {
    await prisma.notification.create({
      data: {
        userId: req.user.id,
        title: urgencyLevel === "critical" ? "🚨 Emergency Alert" : "⚠️ Urgent Health Concern",
        message: `Pawffy AI detected a ${urgencyLevel} urgency issue${pet ? ` for ${pet.name}` : ""}. Please consult a vet immediately.`,
        type: "health",
      },
    });
  }

  res.status(201).json({
    success: true,
    data: {
      sessionId: sid,
      messageId: conversation.id,
      message: conversation.message,
      aiResponse: cleanResponse,
      intent,
      urgencyLevel,
      petContext: pet ? { id: pet.id, name: pet.name, species: pet.species } : null,
    },
  });
});

// ─── GET /api/ai/sessions ──────────────────────────────────────────────────────
exports.getMySessions = asyncHandler(async (req, res) => {
  // Get distinct sessions with last message preview
  const sessions = await prisma.aiConversation.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
    distinct: ["sessionId"],
    select: {
      sessionId: true,
      petId: true,
      message: true,
      aiResponse: true,
      urgencyLevel: true,
      createdAt: true,
      pet: { select: { id: true, name: true, species: true, imageUrl: true } },
    },
  });

  res.json({ success: true, data: sessions });
});

// ─── GET /api/ai/chat/:sessionId ──────────────────────────────────────────────
exports.getConversationHistory = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  const conversations = await prisma.aiConversation.findMany({
    where: { userId: req.user.id, sessionId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      sessionId: true,
      message: true,
      aiResponse: true,
      intent: true,
      urgencyLevel: true,
      createdAt: true,
      pet: { select: { id: true, name: true, species: true } },
    },
  });

  if (conversations.length === 0) {
    return res.status(404).json({ success: false, message: "Session not found" });
  }

  res.json({ success: true, data: conversations });
});

// ─── GET /api/ai/triage/:sessionId ────────────────────────────────────────────
exports.getTriageSummary = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  const conversations = await prisma.aiConversation.findMany({
    where: { userId: req.user.id, sessionId },
    orderBy: { createdAt: "asc" },
  });

  if (conversations.length === 0) {
    return res.status(404).json({ success: false, message: "Session not found" });
  }

  const petId = conversations[0].petId;
  const { pet } = await loadPetContext(petId);

  const summary = await generateTriageSummary(conversations, pet);

  res.json({
    success: true,
    data: {
      sessionId,
      pet: pet ? { id: pet.id, name: pet.name, species: pet.species } : null,
      summary,
      totalMessages: conversations.length,
      highestUrgency: conversations.reduce((max, c) => {
        const order = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
        return (order[c.urgencyLevel] || 0) > (order[max] || 0) ? c.urgencyLevel : max;
      }, "none"),
    },
  });
});

// ─── DELETE /api/ai/chat/:sessionId ───────────────────────────────────────────
exports.deleteSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  const { count } = await prisma.aiConversation.deleteMany({
    where: { userId: req.user.id, sessionId },
  });

  if (count === 0) {
    return res.status(404).json({ success: false, message: "Session not found" });
  }

  res.json({ success: true, message: `Session deleted (${count} messages removed)` });
});

// ─── POST /api/ai/analyze-image ───────────────────────────────────────────────
exports.analyzeImage = asyncHandler(async (req, res) => {
  const { petId, uploadedImage } = req.body;

  if (!petId || !uploadedImage) {
    return res.status(400).json({ success: false, message: "petId and uploadedImage (URL) are required" });
  }

  // Validate URL format
  try {
    new URL(uploadedImage);
  } catch {
    return res.status(400).json({ success: false, message: "uploadedImage must be a valid URL" });
  }

  const pet = await prisma.pet.findUnique({ where: { id: petId } });
  if (!pet) return res.status(404).json({ success: false, message: "Pet not found" });
  if (pet.ownerId !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  const { cleanAnalysis, detectedIssue, confidenceScore, severityLevel, aiRecommendation } =
    await analyzeImage(uploadedImage, pet);

  const analysis = await prisma.aiImageAnalysis.create({
    data: {
      petId,
      uploadedImage,
      detectedIssue,
      confidenceScore,
      aiRecommendation,
      severityLevel,
    },
  });

  // Auto-notify for high/critical severity
  if (severityLevel === "high" || severityLevel === "critical") {
    await prisma.notification.create({
      data: {
        userId: req.user.id,
        title: severityLevel === "critical" ? "🚨 Critical Finding in Image" : "⚠️ Health Issue Detected",
        message: `AI analysis detected: ${detectedIssue} for ${pet.name}. Recommendation: ${aiRecommendation}`,
        type: "health",
      },
    });
  }

  res.status(201).json({
    success: true,
    data: {
      ...analysis,
      fullAnalysis: cleanAnalysis,
    },
  });
});

// ─── GET /api/ai/image-analyses/:petId ────────────────────────────────────────
exports.getImageAnalyses = asyncHandler(async (req, res) => {
  const pet = await prisma.pet.findUnique({ where: { id: req.params.petId } });
  if (!pet) return res.status(404).json({ success: false, message: "Pet not found" });
  if (pet.ownerId !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  const analyses = await prisma.aiImageAnalysis.findMany({
    where: { petId: req.params.petId },
    orderBy: { createdAt: "desc" },
  });

  res.json({ success: true, data: analyses });
});
