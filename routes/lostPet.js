const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const validate = require("../middleware/validate");
const v = require("../validators");
const {
  createLostReport,
  getLostReports,
  getLostReportById,
  updateLostReport,
  deleteLostReport,
} = require("../controllers/petReportController");

router.post("/", verifyToken, validate(v.createLostPetReportSchema), createLostReport);
router.get("/reports", getLostReports);
router.get("/report/:id", getLostReportById);
router.put("/report/:id", verifyToken, validate(v.updateLostPetReportSchema), updateLostReport);
router.delete("/report/:id", verifyToken, deleteLostReport);

module.exports = router;
