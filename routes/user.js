const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { requireRole } = require("../middleware/rbac");
const validate = require("../middleware/validate");
const upload = require("../middleware/upload");
const { validateUuidParams, requireSelfOrAdmin } = require("../middleware/accessControl");
const { uploadLimiter, writeLimiter } = require("../middleware/rateLimiter");
const v = require("../validators");
const {
  getProfile, updateProfile, uploadAvatar, deleteMe,
  getAllUsers, getUserById, deleteUser, changeUserRole,
} = require("../controllers/userController");
const addressController = require("../controllers/addressController");
const customerReviewCtrl = require("../controllers/customerReviewController");

router.get   ("/me",        verifyToken, getProfile);
router.put   ("/me",        verifyToken, validate(v.updateProfileSchema), updateProfile);
router.delete("/me",        verifyToken, writeLimiter, validate(v.deleteAccountSchema), deleteMe);
router.post  ("/me/avatar", verifyToken, uploadLimiter, upload.single("avatar"), uploadAvatar);
router.get   ("/me/reviews", verifyToken, validate(v.customerReviewsQuerySchema, "query"), customerReviewCtrl.getMyReceivedReviews);
router.get   ("/me/addresses", verifyToken, addressController.listAddresses);
router.post  ("/me/addresses", verifyToken, writeLimiter, validate(v.createAddressSchema), addressController.createAddress);
router.put   ("/me/addresses/:id", verifyToken, writeLimiter, validateUuidParams("id"), validate(v.updateAddressSchema), addressController.updateAddress);
router.patch ("/me/addresses/:id/default", verifyToken, writeLimiter, validateUuidParams("id"), addressController.setDefaultAddress);
router.delete("/me/addresses/:id", verifyToken, writeLimiter, validateUuidParams("id"), addressController.deleteAddress);
router.get   ("/",          verifyToken, requireRole("admin"), getAllUsers);
router.get   ("/:id",       verifyToken, validateUuidParams("id"), requireSelfOrAdmin("id"), getUserById);
router.patch ("/:id/role",  verifyToken, requireRole("admin"), validateUuidParams("id"), validate(v.changeUserRoleSchema), changeUserRole);
router.delete("/:id",       verifyToken, requireRole("admin"), validateUuidParams("id"), deleteUser);

module.exports = router;
