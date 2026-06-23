const express = require("express");
const router = express.Router();
const { getAllReports } = require("../controllers/petReportController");

router.get("/", getAllReports);

module.exports = router;
