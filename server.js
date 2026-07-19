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
const isProd = process.env.NODE_ENV === "production";
const allowedOrigins = [
  ...(isProd ? [] : ["http://localhost:3000", "http://localhost:8080"]),
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // No Origin = mobile apps / server-to-server (allowed).
      // Browser requests must match the allowlist.
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      cb(new AppError("Not allowed by CORS", 403));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
    credentials: true,
  })
);

// ─── Stripe webhook — raw Buffer body BEFORE json parser (signature verify) ───
app.use("/api/payments/webhook", express.raw({ type: "application/json", limit: "1mb" }));

// JSON capped at 1mb (matches Joi max for base64 image fields); binary uploads use multer
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use(hpp());
// Skip XSS sanitize for Stripe webhook raw Buffer body
app.use((req, res, next) => {
  if (req.path === "/api/payments/webhook" || req.originalUrl?.startsWith("/api/payments/webhook")) {
    return next();
  }
  return sanitize(req, res, next);
});
app.use("/api", generalLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/auth",            require("./routes/auth"));
app.use("/api/vendor",          require("./routes/vendor"));
app.use("/api/vendors",         require("./routes/vendors"));
app.use("/api/support",         require("./routes/support"));
app.use("/api/wallet",          require("./routes/wallet"));
app.use("/api/static",          require("./routes/static"));
app.use("/api/users",           require("./routes/user"));
app.use("/api/pets",            require("./routes/pet"));
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

// ─── Stripe Connect onboarding landing pages ─────────────────────────────────
// Stripe requires http(s) return/refresh URLs. For the Flutter app these pages
// are opened inside a WebView/Custom Tab; the app detects navigation to these
// paths, closes the WebView, and calls GET /api/vendor/payouts/status.
const connectLandingPage = ({ title, heading, message, accent }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<style>
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    background:#0f172a;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
  .card{max-width:420px;text-align:center;background:#1e293b;border-radius:20px;padding:40px 28px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
  .badge{width:72px;height:72px;border-radius:50%;background:${accent};margin:0 auto 20px;display:flex;align-items:center;justify-content:center;font-size:36px}
  h1{font-size:22px;margin:0 0 10px}p{color:#94a3b8;line-height:1.5;margin:0}
</style></head>
<body><div class="card"><div class="badge">🐾</div>
<h1>${heading}</h1><p>${message}</p></div></body></html>`;

app.get("/vendor/payouts/return", (req, res) => {
  res.type("html").send(
    connectLandingPage({
      title: "Payouts Setup Complete",
      heading: "You're all set!",
      message: "Your payout details were submitted. You can now return to the Pawffy app.",
      accent: "#16a34a",
    })
  );
});

app.get("/vendor/payouts/refresh", (req, res) => {
  res.type("html").send(
    connectLandingPage({
      title: "Resume Payouts Setup",
      heading: "Let's finish setup",
      message: "Your onboarding link expired. Please return to the Pawffy app and start payout setup again.",
      accent: "#d97706",
    })
  );
});

app.use((req, res) => {
  logger.warn({ event: "ROUTE_NOT_FOUND", method: req.method, path: req.path, ip: req.ip });
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
