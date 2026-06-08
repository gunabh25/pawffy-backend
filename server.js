require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const bodyParser = require("body-parser");

const app = express();

// ─── Security & logging ───────────────────────────────────────────────────────
app.use(helmet());
app.use(morgan("dev"));

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      process.env.FRONTEND_URL,
    ].filter(Boolean),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

// ─── Stripe webhook must receive raw body ─────────────────────────────────────
const paymentRoutes = require("./routes/payment");
app.use("/api/payments/webhook", bodyParser.raw({ type: "application/json" }), (req, res, next) => {
  req.rawBody = req.body;
  next();
}, paymentRoutes);

// ─── JSON parser for all other routes ────────────────────────────────────────
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/auth",           require("./routes/auth"));
app.use("/api/users",          require("./routes/user"));
app.use("/api/pets",           require("./routes/pet"));
app.use("/api/vets",           require("./routes/vet"));
app.use("/api/bookings",       require("./routes/booking"));
app.use("/api/payments",       paymentRoutes);
app.use("/api/medical-records",require("./routes/medicalRecord"));
app.use("/api/vaccinations",   require("./routes/vaccination"));
app.use("/api/notifications",  require("./routes/notification"));
app.use("/api/ai",             require("./routes/ai"));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Pawffy API is running 🐾" });
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Error:", err.stack);
  res.status(500).json({ success: false, message: err.message || "Internal Server Error" });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
