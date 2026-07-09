const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const validate = require("../middleware/validate");
const preparePetReportBody = require("../middleware/petReportBody");
const upload = require("../middleware/upload");
const { validateUuidParams } = require("../middleware/accessControl");
const { publicReadLimiter, writeLimiter, uploadLimiter } = require("../middleware/rateLimiter");
const v = require("../validators");
const {
  createFoundReport,
  getFoundReports,
  getFoundReportById,
  updateFoundReport,
  deleteFoundReport,
} = require("../controllers/petReportController");

router.post(
  "/",
  verifyToken,
  writeLimiter,
  uploadLimiter,
  upload.array("images", 3),
  preparePetReportBody,
  validate(v.createFoundPetReportSchema),
  createFoundReport
);
router.get("/", publicReadLimiter, getFoundReports);
router.get("/:id", publicReadLimiter, validateUuidParams("id"), getFoundReportById);
router.put(
  "/:id",
  verifyToken,
  writeLimiter,
  uploadLimiter,
  validateUuidParams("id"),
  upload.array("images", 3),
  preparePetReportBody,
  validate(v.updateFoundPetReportSchema),
  updateFoundReport
);
router.delete("/:id", verifyToken, writeLimiter, validateUuidParams("id"), deleteFoundReport);

module.exports = router;
