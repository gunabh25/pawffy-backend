require("dotenv").config();

const { validateEnv } = require("./config/env");
validateEnv();

const express  = require("express");
const cors     = require("cors");
const helmet   = require("helmet");
const morgan   = require("morgan");
const hpp      = require("hpp");
const crypto   = require("crypto");
const logger   = require("./utils/logger");
const sanitize = require("./middleware/sanitize");
const { generalLimiter } = require("./middleware/rateLimiter");
const errorHandler = require("./middleware/errorHandler");
const AppError = require("./middleware/errors");

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

process.on("unhandledRejection", (reason) => {
  logger.error({ event: "UNHANDLED_REJECTION", error: String(reason) });
});

// ─── Request correlation ID ───────────────────────────────────────────────────
app.use((req, res, next) => {
  req.requestId = req.headers["x-request-id"] || crypto.randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
});

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
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
  })
);

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
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new AppError("Not allowed by CORS", 403));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
    credentials: true,
  })
);

// ─── Stripe webhook — raw body BEFORE json parser ─────────────────────────────
app.use("/api/payments/webhook", express.raw({ type: "application/json", limit: "1mb" }));

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

app.use(hpp());
app.use(sanitize);
app.use("/api", generalLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/auth",            require("./routes/auth"));
app.use("/api/vendor",          require("./routes/vendor"));
app.use("/api/users",           require("./routes/user"));
app.use("/api/pets",            require("./routes/pet"));
app.use("/api/vets",            require("./routes/vet"));
app.use("/api/bookings",        require("./routes/booking"));
app.use("/api/payments",        require("./routes/payment"));
app.use("/api/medical-records", require("./routes/medicalRecord"));
app.use("/api/vaccinations",    require("./routes/vaccination"));
app.use("/api/notifications",   require("./routes/notification"));
app.use("/api/messages",        require("./routes/message"));
app.use("/api/lost-pets",       require("./routes/lostPet"));
app.use("/api/found-pets",      require("./routes/foundPet"));
app.use("/api/reports",         require("./routes/report"));
app.use("/api/dashboard",       require("./routes/dashboard"));

app.get("/", (req, res) => res.json({ status: "ok", message: "Pawffy API is running 🐾" }));

app.use((req, res) => {
  logger.warn({ event: "ROUTE_NOT_FOUND", method: req.method, path: req.path, ip: req.ip });
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
