const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const validate = require("../middleware/validate");
const { validateUuidParams } = require("../middleware/accessControl");
const { publicReadLimiter, writeLimiter } = require("../middleware/rateLimiter");
const v = require("../validators");
const {
  createFoundReport,
  getFoundReports,
  getFoundReportById,
  updateFoundReport,
  deleteFoundReport,
} = require("../controllers/petReportController");

router.post("/", verifyToken, writeLimiter, validate(v.createFoundPetReportSchema), createFoundReport);
router.get("/", publicReadLimiter, getFoundReports);
router.get("/:id", publicReadLimiter, validateUuidParams("id"), getFoundReportById);
router.put("/:id", verifyToken, writeLimiter, validateUuidParams("id"), validate(v.updateFoundPetReportSchema), updateFoundReport);
router.delete("/:id", verifyToken, writeLimiter, validateUuidParams("id"), deleteFoundReport);

module.exports = router;
