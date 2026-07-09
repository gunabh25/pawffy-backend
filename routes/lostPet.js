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
  createLostReport,
  getLostReports,
  getLostReportById,
  updateLostReport,
  deleteLostReport,
} = require("../controllers/petReportController");

router.post(
  "/",
  verifyToken,
  writeLimiter,
  uploadLimiter,
  upload.array("images", 3),
  preparePetReportBody,
  validate(v.createLostPetReportSchema),
  createLostReport
);
router.get("/reports", publicReadLimiter, getLostReports);
router.get("/report/:id", publicReadLimiter, validateUuidParams("id"), getLostReportById);
router.put(
  "/report/:id",
  verifyToken,
  writeLimiter,
  uploadLimiter,
  validateUuidParams("id"),
  upload.array("images", 3),
  preparePetReportBody,
  validate(v.updateLostPetReportSchema),
  updateLostReport
);
router.delete("/report/:id", verifyToken, writeLimiter, validateUuidParams("id"), deleteLostReport);

module.exports = router;
