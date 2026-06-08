const { GoogleGenerativeAI } = require("@google/generative-ai");
const OpenAI = require("openai");

// ─── Provider selection ───────────────────────────────────────────────────────
function getProvider() {
  return (process.env.AI_PROVIDER || "gemini").toLowerCase();
}

function getGeminiClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "your-gemini-api-key-here") {
    throw new Error(
      "GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/app/apikey"
    );
  }
  return new GoogleGenerativeAI(key);
}

function getOpenAIClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set.");
  return new OpenAI({ apiKey: key });
}

// ─── Retry + model fallback for Gemini ───────────────────────────────────────
// Tries the configured model first, then falls back down the chain.
// Retries on 503 (overload) and 429 (rate-limit) up to `maxRetries` times
// with exponential backoff before moving to the next model.

const GEMINI_FALLBACK_CHAIN = [
  process.env.GEMINI_MODEL || "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryable(err) {
  const msg = err.message || "";
  return (
    msg.includes("503") ||
    msg.includes("Service Unavailable") ||
    msg.includes("high demand") ||
    msg.includes("429") ||
    msg.includes("Too Many Requests")
  );
}

async function withGeminiRetry(fn, maxRetries = 2) {
  const models = [...new Set(GEMINI_FALLBACK_CHAIN)]; // deduplicate
  for (let mi = 0; mi < models.length; mi++) {
    const modelName = models[mi];
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn(modelName);
      } catch (err) {
        const isLast = mi === models.length - 1 && attempt === maxRetries;
        if (isRetryable(err) && !isLast) {
          const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s …
          if (attempt === maxRetries) {
            // Exhausted retries for this model → try next model
            console.warn(
              `[AI] ${modelName} unavailable after ${maxRetries + 1} tries. Falling back…`
            );
            break;
          }
          console.warn(
            `[AI] ${modelName} returned ${err.message.slice(0, 60)}. Retry in ${delay}ms…`
          );
          await sleep(delay);
        } else {
          throw err; // Non-retryable or truly exhausted
        }
      }
    }
  }
  throw new Error("All Gemini models are currently unavailable. Please try again in a moment.");
}

// ─── System prompt builder ────────────────────────────────────────────────────
function buildSystemPrompt(pet, recentVaccinations, recentMedicalRecords) {
  let petContext = "";

  if (pet) {
    petContext = `
You are helping a pet owner about their pet:
- Name: ${pet.name}
- Species: ${pet.species}
- Breed: ${pet.breed || "Unknown"}
- Age: ${pet.age ? `${pet.age} year(s)` : "Unknown"}
- Weight: ${pet.weight ? `${pet.weight} kg` : "Unknown"}
- Gender: ${pet.gender || "Unknown"}
- Vaccination Status: ${pet.vaccinationStatus || "Unknown"}
- Medical Notes: ${pet.medicalNotes || "None"}`;

    if (recentVaccinations?.length > 0) {
      petContext += `\n\nRecent Vaccinations:`;
      recentVaccinations.forEach((v) => {
        petContext += `\n  - ${v.vaccineName} on ${new Date(v.vaccinationDate).toDateString()}`;
        if (v.nextDueDate) petContext += ` (next due: ${new Date(v.nextDueDate).toDateString()})`;
      });
    }

    if (recentMedicalRecords?.length > 0) {
      petContext += `\n\nRecent Medical History:`;
      recentMedicalRecords.forEach((r) => {
        if (r.diagnosis) petContext += `\n  - Diagnosis: ${r.diagnosis}`;
        if (r.allergies) petContext += `\n    Allergies: ${r.allergies}`;
      });
    }
  }

  return `You are Pawffy AI, an expert veterinary health assistant for the Pawffy pet care platform.
You provide accurate, compassionate, and practical pet health guidance.
${petContext}

Guidelines:
1. Be warm, empathetic, and supportive.
2. Give specific, actionable advice based on symptoms described.
3. Detect urgency: if symptoms suggest an emergency (difficulty breathing, severe bleeding, collapse, seizures, suspected poisoning, severe pain), immediately flag it as URGENT.
4. Never replace a vet — always recommend professional consultation for serious concerns.
5. Provide home care tips for mild issues.
6. If vaccination/medical history is provided, factor it into your response.
7. Use bullet points for clarity.
8. End EVERY response with these two lines exactly:
   URGENCY: [none|low|medium|high|critical]
   INTENT: [general_inquiry|symptom_check|medication_query|emergency|nutrition|behavior|grooming|vaccination|appointment_request]`;
}

// ─── Parse metadata from AI response ─────────────────────────────────────────
function parseMetadata(text) {
  const urgencyMatch = text.match(/URGENCY:\s*(none|low|medium|high|critical)/i);
  const intentMatch  = text.match(/INTENT:\s*(\w+)/i);
  const urgencyLevel = urgencyMatch ? urgencyMatch[1].toLowerCase() : "low";
  const intent       = intentMatch  ? intentMatch[1].toLowerCase()  : "general_inquiry";
  const cleanResponse = text
    .replace(/URGENCY:\s*(none|low|medium|high|critical)\s*/gi, "")
    .replace(/INTENT:\s*\w+\s*/gi, "")
    .trim();
  return { cleanResponse, urgencyLevel, intent };
}

// ─── Chat with Gemini (with retry + fallback) ─────────────────────────────────
async function chatWithGemini(systemPrompt, history, userMessage) {
  const genAI = getGeminiClient();

  const geminiHistory = [];
  for (const turn of history) {
    if (turn.message)    geminiHistory.push({ role: "user",  parts: [{ text: turn.message }] });
    if (turn.aiResponse) geminiHistory.push({ role: "model", parts: [{ text: turn.aiResponse }] });
  }

  return withGeminiRetry(async (modelName) => {
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: systemPrompt,
    });
    const chat = model.startChat({ history: geminiHistory });
    const result = await chat.sendMessage(userMessage);
    return parseMetadata(result.response.text());
  });
}

// ─── Chat with OpenAI ─────────────────────────────────────────────────────────
async function chatWithOpenAI(systemPrompt, history, userMessage) {
  const client = getOpenAIClient();
  const messages = [
    { role: "system", content: systemPrompt },
    ...history.flatMap((c) => [
      { role: "user",      content: c.message },
      { role: "assistant", content: c.aiResponse || "" },
    ]),
    { role: "user", content: userMessage },
  ];
  const res = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o",
    messages,
    temperature: 0.4,
    max_tokens: 1000,
  });
  return parseMetadata(res.choices[0].message.content);
}

// ─── Public: chatCompletion ───────────────────────────────────────────────────
async function chatCompletion(systemPrompt, history, userMessage) {
  if (getProvider() === "openai") {
    return chatWithOpenAI(systemPrompt, history, userMessage);
  }
  return chatWithGemini(systemPrompt, history, userMessage);
}

// ─── Image analysis with Gemini (with retry + fallback) ───────────────────────
async function analyzeImageWithGemini(imageUrl, pet) {
  const genAI = getGeminiClient();

  const petInfo = pet
    ? `Pet: ${pet.name}, ${pet.species}${pet.breed ? `, ${pet.breed}` : ""}${pet.age ? `, ${pet.age} year(s) old` : ""}.`
    : "Pet details not provided.";

  const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Could not fetch image from URL: ${imageUrl}`);
  const buffer = await response.buffer();
  const base64 = buffer.toString("base64");
  const mimeType = response.headers.get("content-type") || "image/jpeg";

  const prompt = `You are an expert veterinary AI vision assistant. Analyze this image.
${petInfo}

Examine the image and provide:
1. What you observe (visible symptoms, skin conditions, injuries, posture, body condition, etc.)
2. Potential diagnosis or health concern detected
3. Confidence level (0-100%) of your assessment
4. Recommended next steps
5. Severity assessment

End your response with these exact lines:
DETECTED_ISSUE: [brief description or "No visible issues"]
CONFIDENCE: [0-100]
SEVERITY: [low|medium|high|critical]
RECOMMENDATION: [one-line recommendation]`;

  return withGeminiRetry(async (modelName) => {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent([
      { inlineData: { data: base64, mimeType } },
      prompt,
    ]);
    return extractImageAnalysis(result.response.text());
  });
}

// ─── Image analysis with OpenAI Vision ───────────────────────────────────────
async function analyzeImageWithOpenAI(imageUrl, pet) {
  const client  = getOpenAIClient();
  const petInfo = pet
    ? `Pet: ${pet.name}, ${pet.species}${pet.breed ? `, ${pet.breed}` : ""}${pet.age ? `, ${pet.age} year(s) old` : ""}.`
    : "Pet details not provided.";

  const result = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o",
    messages: [{
      role: "user",
      content: [
        { type: "text", text: `You are an expert veterinary AI vision assistant. Analyze this pet image.\n${petInfo}\n\nProvide: observations, diagnosis, confidence (0-100), recommendations, severity.\n\nEnd with:\nDETECTED_ISSUE: [description]\nCONFIDENCE: [0-100]\nSEVERITY: [low|medium|high|critical]\nRECOMMENDATION: [one line]` },
        { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
      ],
    }],
    temperature: 0.2,
    max_tokens: 800,
  });

  return extractImageAnalysis(result.choices[0].message.content);
}

function extractImageAnalysis(raw) {
  const issueMatch     = raw.match(/DETECTED_ISSUE:\s*(.+)/i);
  const confMatch      = raw.match(/CONFIDENCE:\s*(\d+)/i);
  const severityMatch  = raw.match(/SEVERITY:\s*(low|medium|high|critical)/i);
  const recommendMatch = raw.match(/RECOMMENDATION:\s*(.+)/i);

  const cleanAnalysis = raw
    .replace(/DETECTED_ISSUE:\s*.+/gi, "")
    .replace(/CONFIDENCE:\s*\d+/gi, "")
    .replace(/SEVERITY:\s*\w+/gi, "")
    .replace(/RECOMMENDATION:\s*.+/gi, "")
    .trim();

  return {
    cleanAnalysis,
    detectedIssue:    issueMatch     ? issueMatch[1].trim()        : "Unable to determine",
    confidenceScore:  confMatch      ? parseInt(confMatch[1]) / 100 : null,
    severityLevel:    severityMatch  ? severityMatch[1].toLowerCase() : "low",
    aiRecommendation: recommendMatch ? recommendMatch[1].trim()    : "Please consult a veterinarian.",
  };
}

// ─── Public: analyzeImage ─────────────────────────────────────────────────────
async function analyzeImage(imageUrl, pet) {
  if (getProvider() === "openai") {
    return analyzeImageWithOpenAI(imageUrl, pet);
  }
  return analyzeImageWithGemini(imageUrl, pet);
}

// ─── Triage summary (with retry + fallback) ───────────────────────────────────
async function generateTriageSummary(conversations, pet) {
  const chatHistory = conversations
    .map((c) => `User: ${c.message}\nAI: ${c.aiResponse}`)
    .join("\n\n");
  const petInfo = pet ? `Pet: ${pet.name} (${pet.species}, ${pet.age || "?"} yrs)` : "";

  const prompt = `${petInfo}\n\nConversation:\n${chatHistory}\n\nProvide a structured triage summary with: Chief Complaint, Symptoms Mentioned, Urgency Level, and Recommended Action.`;

  if (getProvider() === "openai") {
    const client = getOpenAIClient();
    const res = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o",
      messages: [
        { role: "system", content: "You are a veterinary AI. Summarize the pet health conversation into a concise triage report for a veterinarian." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 600,
    });
    return res.choices[0].message.content;
  }

  const genAI = getGeminiClient();
  return withGeminiRetry(async (modelName) => {
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction:
        "You are a veterinary AI. Summarize the pet health conversation into a concise triage report for a veterinarian.",
    });
    const result = await model.generateContent(prompt);
    return result.response.text();
  });
}

module.exports = { chatCompletion, analyzeImage, generateTriageSummary, buildSystemPrompt };
