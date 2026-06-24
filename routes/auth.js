const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const validate = require("../middleware/validate");
const { authLimiter, forgotPasswordLimiter } = require("../middleware/rateLimiter");
const v = require("../validators");
const {
  register, login, getMe, logout,
  forgotPassword, resetPassword, changePassword,
} = require("../controllers/authController");

router.post("/register",        authLimiter, validate(v.registerSchema),       register);
router.post("/login",           authLimiter, validate(v.loginSchema),           login);
router.get ("/me",              verifyToken,                                     getMe);
router.post("/logout",          verifyToken,                                     logout);
router.post("/forgot-password", forgotPasswordLimiter, validate(v.forgotPasswordSchema), forgotPassword);
router.post("/reset-password",  forgotPasswordLimiter, validate(v.resetPasswordSchema), resetPassword);
router.post("/change-password", verifyToken, validate(v.changePasswordSchema),  changePassword);

module.exports = router;
