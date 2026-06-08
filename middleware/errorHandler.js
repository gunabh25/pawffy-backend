function errorHandler(err, req, res, next) {
  console.error("Error:", err.message);

  // All Gemini models overloaded / unavailable
  if (err.message && err.message.includes("All Gemini models are currently unavailable")) {
    return res.status(503).json({
      success: false,
      message: "AI service is temporarily overloaded. Please try again in a few seconds.",
    });
  }

  // Gemini / OpenAI 503 high demand
  if (err.message && (err.message.includes("503") || err.message.includes("high demand") || err.message.includes("Service Unavailable"))) {
    return res.status(503).json({
      success: false,
      message: "AI service is temporarily overloaded. Please try again in a few seconds.",
    });
  }

  // OpenAI quota / billing
  if (err.status === 429 || (err.message && err.message.includes("429"))) {
    return res.status(402).json({
      success: false,
      message: "AI quota exceeded. Add billing at platform.openai.com or switch AI_PROVIDER=gemini in .env",
    });
  }

  // AI API key missing
  if (err.message && (err.message.includes("GEMINI_API_KEY") || err.message.includes("OPENAI_API_KEY"))) {
    return res.status(503).json({
      success: false,
      message: err.message,
    });
  }

  // Prisma not found
  if (err.code === "P2025") {
    return res.status(404).json({ success: false, message: "Record not found" });
  }

  // Prisma unique constraint
  if (err.code === "P2002") {
    return res.status(409).json({ success: false, message: "A record with this value already exists" });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
}

module.exports = errorHandler;
