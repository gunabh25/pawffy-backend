const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { requireRole } = require("../middleware/rbac");
const validate = require("../middleware/validate");
const upload = require("../middleware/upload");
const { validateUuidParams, requireSelfOrAdmin } = require("../middleware/accessControl");
const { uploadLimiter } = require("../middleware/rateLimiter");
const v = require("../validators");
const { getProfile, updateProfile, uploadAvatar, getAllUsers, getUserById, deleteUser, changeUserRole } = require("../controllers/userController");

router.get   ("/me",        verifyToken, getProfile);
router.put   ("/me",        verifyToken, validate(v.updateProfileSchema), updateProfile);
router.post  ("/me/avatar", verifyToken, uploadLimiter, upload.single("avatar"), uploadAvatar);
router.get   ("/",          verifyToken, requireRole("admin"), getAllUsers);
router.get   ("/:id",       verifyToken, validateUuidParams("id"), requireSelfOrAdmin("id"), getUserById);
router.patch ("/:id/role",  verifyToken, requireRole("admin"), validateUuidParams("id"), changeUserRole);
router.delete("/:id",       verifyToken, requireRole("admin"), validateUuidParams("id"), deleteUser);

module.exports = router;
