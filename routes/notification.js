const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { getMyNotifications, markAsRead, markAllAsRead, deleteNotification, createNotification } = require("../controllers/notificationController");

router.get("/", verifyToken, getMyNotifications);
router.post("/", verifyToken, createNotification);
router.patch("/:id/read", verifyToken, markAsRead);
router.patch("/read-all", verifyToken, markAllAsRead);
router.delete("/:id", verifyToken, deleteNotification);

module.exports = router;
