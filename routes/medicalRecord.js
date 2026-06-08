const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { createRecord, getRecordsByPet, getRecordById, updateRecord, deleteRecord } = require("../controllers/medicalRecordController");

router.post("/", verifyToken, createRecord);
router.get("/pet/:petId", verifyToken, getRecordsByPet);
router.get("/:id", verifyToken, getRecordById);
router.put("/:id", verifyToken, updateRecord);
router.delete("/:id", verifyToken, deleteRecord);

module.exports = router;
