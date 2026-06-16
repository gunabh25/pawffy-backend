require("dotenv").config();

// ─── Startup: validate critical environment variables ─────────────────────────
const REQUIRED_ENV = ["JWT_SECRET", "DATABASE_URL"];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`❌ Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const express  = require("express");
const cors     = require("cors");
const helmet   = require("helmet");
const morgan   = require("morgan");
const hpp      = require("hpp");
const logger   = require("./utils/logger");
const sanitize = require("./middleware/sanitize");
const { generalLimiter } = require("./middleware/rateLimiter");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// ─── Trust proxy (Render / reverse proxies) ───────────────────────────────────
app.set("trust proxy", 1);

// ─── Security headers (helmet) ────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'"],
        styleSrc:   ["'self'", "'unsafe-inline'"],
        imgSrc:     ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        frameSrc:   ["'none'"],
        objectSrc:  ["'none'"],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    permittedCrossDomainPolicies: false,
    crossOriginEmbedderPolicy: false, // allow base64 images
  })
);

// ─── HTTP request logging ─────────────────────────────────────────────────────
app.use(
  morgan("combined", {
    stream: { write: (msg) => logger.info(msg.trim()) },
    skip: (req) => req.path === "/",
  })
);

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:8080",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (mobile apps, Postman, curl)
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    credentials: true,
  })
);

// ─── Stripe webhook — must receive raw body BEFORE json parser ────────────────
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

// ─── Body parsers ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "5mb" }));       // 5MB allows base64 images
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// ─── HTTP Parameter Pollution prevention ──────────────────────────────────────
app.use(hpp());

// ─── XSS input sanitization ───────────────────────────────────────────────────
app.use(sanitize);

// ─── Global rate limiter ──────────────────────────────────────────────────────
app.use("/api", generalLimiter);

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

// ─── Health check (no rate limit, no auth) ────────────────────────────────────
app.get("/", (req, res) => res.json({ status: "ok", message: "Pawffy API is running 🐾" }));

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  logger.warn({ event: "ROUTE_NOT_FOUND", method: req.method, path: req.path, ip: req.ip });
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// ─── Centralized error handler ────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => logger.info(`✅ Server running on port ${PORT}`));
