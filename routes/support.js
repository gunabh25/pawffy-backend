const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const validate = require("../middleware/validate");
const { writeLimiter } = require("../middleware/rateLimiter");
const v = require("../validators");
const supportController = require("../controllers/supportController");

router.post("/tickets", verifyToken, writeLimiter, validate(v.supportTicketSchema), supportController.createTicket);

module.exports = router;
