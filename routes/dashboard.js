const express = require("express");
const router = express.Router();
const optionalAuth = require("../middleware/optionalAuth");
const verifyToken = require("../middleware/verifyToken");
const validate = require("../middleware/validate");
const { validateUuidParams, requireSelfOrAdmin } = require("../middleware/accessControl");
const { publicReadLimiter } = require("../middleware/rateLimiter");
const v = require("../validators");
const dashboardController = require("../controllers/dashboardController");

router.post("/dashboard", optionalAuth, validate(v.dashboardSchema), dashboardController.getDashboard);
router.get("/users/:id", verifyToken, validateUuidParams("id"), requireSelfOrAdmin("id"), dashboardController.getUserById);
router.post("/partners", publicReadLimiter, validate(v.partnersNearbySchema), dashboardController.getPartnersNearby);
router.get("/notifications/:id", verifyToken, validateUuidParams("id"), requireSelfOrAdmin("id"), dashboardController.getNotificationsById);
router.get("/categories", publicReadLimiter, dashboardController.getActiveCategories);
router.get("/banner", publicReadLimiter, dashboardController.getBanner);

module.exports = router;
