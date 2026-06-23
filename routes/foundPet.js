const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const validate = require("../middleware/validate");
const v = require("../validators");
const {
  createFoundReport,
  getFoundReports,
  getFoundReportById,
  updateFoundReport,
  deleteFoundReport,
} = require("../controllers/petReportController");

router.post("/", verifyToken, validate(v.createFoundPetReportSchema), createFoundReport);
router.get("/", getFoundReports);
router.get("/:id", getFoundReportById);
router.put("/:id", verifyToken, validate(v.updateFoundPetReportSchema), updateFoundReport);
router.delete("/:id", verifyToken, deleteFoundReport);

module.exports = router;
