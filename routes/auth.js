const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const validate = require("../middleware/validate");
const { authLimiter } = require("../middleware/rateLimiter");
const v = require("../validators");
const {
  session, registerVendor, getMe, logout,
} = require("../controllers/authController");

router.post("/session",         authLimiter, validate(v.sessionSchema), session);
router.post("/vendor/register", authLimiter, validate(v.vendorRegisterSchema), registerVendor);
router.get ("/me",               verifyToken, getMe);
router.post("/logout",           verifyToken, logout);

module.exports = router;
