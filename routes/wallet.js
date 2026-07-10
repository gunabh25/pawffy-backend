const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const validate = require("../middleware/validate");
const { validateUuidParams } = require("../middleware/accessControl");
const { writeLimiter, paymentLimiter } = require("../middleware/rateLimiter");
const v = require("../validators");
const walletController = require("../controllers/walletController");

router.get("/", verifyToken, walletController.getWallet);
router.post("/top-up", verifyToken, writeLimiter, validate(v.walletAmountSchema), walletController.topUp);
router.post("/top-up/intent", verifyToken, paymentLimiter, validate(v.walletAmountSchema), walletController.createTopUpIntent);
router.post("/top-up/verify", verifyToken, paymentLimiter, validate(v.verifyPaymentSchema), walletController.verifyTopUp);
router.post("/withdraw", verifyToken, writeLimiter, validate(v.walletAmountSchema), walletController.withdraw);

module.exports = router;
