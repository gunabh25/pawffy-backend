const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const validate = require("../middleware/validate");
const { validateUuidParams } = require("../middleware/accessControl");
const { publicReadLimiter, writeLimiter } = require("../middleware/rateLimiter");
const v = require("../validators");
const {
  createLostReport,
  getLostReports,
  getLostReportById,
  updateLostReport,
  deleteLostReport,
} = require("../controllers/petReportController");

router.post("/", verifyToken, writeLimiter, validate(v.createLostPetReportSchema), createLostReport);
router.get("/reports", publicReadLimiter, getLostReports);
router.get("/report/:id", publicReadLimiter, validateUuidParams("id"), getLostReportById);
router.put("/report/:id", verifyToken, writeLimiter, validateUuidParams("id"), validate(v.updateLostPetReportSchema), updateLostReport);
router.delete("/report/:id", verifyToken, writeLimiter, validateUuidParams("id"), deleteLostReport);

module.exports = router;
