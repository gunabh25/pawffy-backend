const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { requireRole } = require("../middleware/rbac");
const validate = require("../middleware/validate");
const { validateUuidParams } = require("../middleware/accessControl");
const { writeLimiter } = require("../middleware/rateLimiter");
const v = require("../validators");
const { getMyNotifications, markAsRead, markAllAsRead, deleteNotification, createNotification } = require("../controllers/notificationController");

router.get   ("/",         verifyToken, getMyNotifications);
router.post  ("/",         verifyToken, requireRole("admin"), writeLimiter, validate(v.createNotificationSchema), createNotification);
router.patch ("/:id/read", verifyToken, validateUuidParams("id"), markAsRead);
router.patch ("/read-all", verifyToken, markAllAsRead);
router.delete("/:id",      verifyToken, validateUuidParams("id"), deleteNotification);

module.exports = router;
