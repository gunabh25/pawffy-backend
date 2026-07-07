const express = require("express");
const router = express.Router();
const { publicReadLimiter } = require("../middleware/rateLimiter");
const staticController = require("../controllers/staticController");

router.get("/terms", publicReadLimiter, staticController.getTerms);
router.get("/privacy", publicReadLimiter, staticController.getPrivacy);

module.exports = router;
