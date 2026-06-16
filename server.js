require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const app = express();

// ─── Security & logging ───────────────────────────────────────────────────────
app.use(helmet());
app.use(morgan("dev"));

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: ["http://localhost:3000", process.env.FRONTEND_URL].filter(Boolean),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

// ─── Stripe webhook needs raw body — register BEFORE express.json() ──────────
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

// ─── JSON body parser for all other routes ────────────────────────────────────
app.use(express.json({ limit: "5mb" }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/auth",            require("./routes/auth"));
app.use("/api/users",           require("./routes/user"));
app.use("/api/pets",            require("./routes/pet"));
app.use("/api/vets",            require("./routes/vet"));
app.use("/api/bookings",        require("./routes/booking"));
app.use("/api/payments",        require("./routes/payment"));
app.use("/api/medical-records", require("./routes/medicalRecord"));
app.use("/api/vaccinations",    require("./routes/vaccination"));
app.use("/api/notifications",   require("./routes/notification"));
app.use("/api/messages",        require("./routes/message"));

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
  res.status(err.status || 500).json({ success: false, message: err.message || "Internal Server Error" });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
