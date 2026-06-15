const prisma = require("../config/prisma");
const asyncHandler = require("../middleware/asyncHandler");

// ─── Create notification — userId is always from the auth token ───────────────
exports.createNotification = asyncHandler(async (req, res) => {
  const { title, message, type } = req.body;

  if (!title || !message) {
    return res.status(400).json({ success: false, message: "title and message are required" });
  }

  const notification = await prisma.notification.create({
    data: {
      userId: req.user.id,
      title,
      message,
      type: type || "general",
    },
  });

  res.status(201).json({ success: true, data: notification });
});

exports.getMyNotifications = asyncHandler(async (req, res) => {
  const { unread } = req.query;

  const notifications = await prisma.notification.findMany({
    where: {
      userId: req.user.id,
      ...(unread === "true" && { isRead: false }),
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({ success: true, data: notifications });
});

exports.markAsRead = asyncHandler(async (req, res) => {
  const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!notification) return res.status(404).json({ success: false, message: "Notification not found" });
  if (notification.userId !== req.user.id) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  const updated = await prisma.notification.update({
    where: { id: req.params.id },
    data: { isRead: true },
  });

  res.json({ success: true, data: updated });
});

exports.markAllAsRead = asyncHandler(async (req, res) => {
  const { count } = await prisma.notification.updateMany({
    where: { userId: req.user.id, isRead: false },
    data: { isRead: true },
  });

  res.json({ success: true, message: `${count} notifications marked as read` });
});

exports.deleteNotification = asyncHandler(async (req, res) => {
  const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!notification) return res.status(404).json({ success: false, message: "Notification not found" });
  if (notification.userId !== req.user.id) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  await prisma.notification.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: "Notification deleted" });
});
