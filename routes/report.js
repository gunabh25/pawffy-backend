const express = require("express");
const router = express.Router();
const { publicReadLimiter } = require("../middleware/rateLimiter");
const { getAllReports } = require("../controllers/petReportController");

router.get("/", publicReadLimiter, getAllReports);

module.exports = router;
