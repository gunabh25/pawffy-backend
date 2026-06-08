const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { getProfile, updateProfile, getAllUsers, getUserById, deleteUser } = require("../controllers/userController");

router.get("/me", verifyToken, getProfile);
router.put("/me", verifyToken, updateProfile);
router.get("/", verifyToken, getAllUsers);
router.get("/:id", verifyToken, getUserById);
router.delete("/:id", verifyToken, deleteUser);

module.exports = router;
