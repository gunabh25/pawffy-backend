const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const validate = require("../middleware/validate");
const { authLimiter, forgotPasswordLimiter } = require("../middleware/rateLimiter");
const v = require("../validators");
const {
  register, registerVendor, login, loginVendor, verifyLogin2fa, getMe, logout,
  forgotPassword, resetPassword, changePassword,
} = require("../controllers/authController");

router.post("/register",        authLimiter, validate(v.registerSchema),       register);
router.post("/vendor/register", authLimiter, validate(v.vendorRegisterSchema), registerVendor);
router.post("/login",           authLimiter, validate(v.loginSchema),           login);
router.post("/vendor/login",    authLimiter, validate(v.vendorLoginSchema),     loginVendor);
router.post("/login/2fa/verify", authLimiter, validate(v.login2faVerifySchema), verifyLogin2fa);
router.get ("/me",              verifyToken,                                     getMe);
router.post("/logout",          verifyToken,                                     logout);
router.post("/forgot-password", forgotPasswordLimiter, validate(v.forgotPasswordSchema), forgotPassword);
router.post("/reset-password",  forgotPasswordLimiter, validate(v.resetPasswordSchema), resetPassword);
router.post("/change-password", verifyToken, validate(v.changePasswordSchema),  changePassword);

module.exports = router;
