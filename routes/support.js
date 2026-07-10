const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const validate = require("../middleware/validate");
const documentUpload = require("../middleware/documentUpload");
const { writeLimiter } = require("../middleware/rateLimiter");
const v = require("../validators");
const supportController = require("../controllers/supportController");

router.get("/tickets", verifyToken, supportController.listMyTickets);
router.post(
  "/tickets",
  verifyToken,
  writeLimiter,
  documentUpload.single("attachment"),
  validate(v.supportTicketSchema),
  supportController.createTicket
);

module.exports = router;
