const prisma = require("../config/prisma");
const asyncHandler = require("../middleware/asyncHandler");

exports.getProfile = asyncHandler(async (req, res) => {
  const { passwordHash, ...user } = req.user;
  res.json({ success: true, data: user });
});

exports.updateProfile = asyncHandler(async (req, res) => {
  const { name, phone, profileImage, address, city, state } = req.body;

  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: { name, phone, profileImage, address, city, state },
    select: {
      id: true, name: true, email: true, phone: true, role: true,
      profileImage: true, address: true, city: true, state: true,
      createdAt: true, updatedAt: true,
    },
  });

  res.json({ success: true, data: updated });
});

// ─── Upload Avatar (multipart/form-data field: "avatar") ──────────────────────
exports.uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No image file provided. Send field name: avatar" });
  }

  const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;

  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: { profileImage: base64 },
    select: { id: true, name: true, email: true, profileImage: true },
  });

  res.json({ success: true, message: "Avatar updated", data: updated });
});

exports.getAllUsers = asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true, name: true, email: true, phone: true, role: true,
      profileImage: true, city: true, state: true, createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({ success: true, data: users });
});

exports.getUserById = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true, name: true, email: true, phone: true, role: true,
      profileImage: true, address: true, city: true, state: true,
      createdAt: true, updatedAt: true,
      pets: { select: { id: true, name: true, species: true, breed: true, imageUrl: true } },
    },
  });

  if (!user) return res.status(404).json({ success: false, message: "User not found" });
  res.json({ success: true, data: user });
});

exports.deleteUser = asyncHandler(async (req, res) => {
  await prisma.user.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: "User deleted" });
});

exports.changeUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  const validRoles = ["user", "admin", "vet"];

  if (!role || !validRoles.includes(role)) {
    return res.status(400).json({
      success: false,
      message: `Invalid role. Must be one of: ${validRoles.join(", ")}`,
    });
  }

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ success: false, message: "User not found" });

  const updated = await prisma.user.update({
    where: { id: req.params.id },
    data: { role },
    select: { id: true, name: true, email: true, role: true },
  });

  res.json({ success: true, message: `Role updated to "${role}"`, data: updated });
});
