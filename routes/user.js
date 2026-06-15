const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const upload = require("../middleware/upload");
const { getProfile, updateProfile, uploadAvatar, getAllUsers, getUserById, deleteUser } = require("../controllers/userController");

router.get("/me", verifyToken, getProfile);
router.put("/me", verifyToken, updateProfile);
router.post("/me/avatar", verifyToken, upload.single("avatar"), uploadAvatar);
router.get("/", verifyToken, getAllUsers);
router.get("/:id", verifyToken, getUserById);
router.delete("/:id", verifyToken, deleteUser);

module.exports = router;
