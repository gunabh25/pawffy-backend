const prisma = require("../config/prisma");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../middleware/errors");
const { assertOwnerOrAdmin } = require("../utils/petAccess");
const { sanitizeUser } = require("../utils/auth");
const accountService = require("../services/account.service");

exports.getProfile = asyncHandler(async (req, res) => {
  res.json({ success: true, data: sanitizeUser(req.user) });
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

  if (address !== undefined) {
    const defaultAddress = await prisma.userAddress.findFirst({
      where: { userId: req.user.id, isDefault: true },
    });
    if (defaultAddress) {
      await prisma.userAddress.update({
        where: { id: defaultAddress.id },
        data: {
          address: address || defaultAddress.address,
          city: city !== undefined ? city : defaultAddress.city,
          state: state !== undefined ? state : defaultAddress.state,
        },
      });
    }
  }

  res.json({ success: true, data: updated });
});

exports.deleteMe = asyncHandler(async (req, res) => {
  await accountService.deleteAccount(req.user.id);
  res.json({ success: true, message: "Account deleted successfully" });
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

  if (!user) throw new AppError("User not found", 404);
  assertOwnerOrAdmin(req, user.id);
  res.json({ success: true, data: user });
});

exports.deleteUser = asyncHandler(async (req, res) => {
  await prisma.user.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: "User deleted" });
});

exports.changeUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;

  if (role === "admin" && process.env.ALLOW_ADMIN_PROMOTION !== "true") {
    throw new AppError("Admin promotion is disabled. Set ALLOW_ADMIN_PROMOTION=true to allow.", 403);
  }

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) throw new AppError("User not found", 404);

  const updated = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      role,
      tokenVersion: { increment: 1 },
    },
    select: { id: true, name: true, email: true, role: true },
  });

  res.json({ success: true, message: `Role updated to "${role}"`, data: updated });
});
