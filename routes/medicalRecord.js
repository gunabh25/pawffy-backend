const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const validate = require("../middleware/validate");
const v = require("../validators");
const { createRecord, getRecordsByPet, getRecordById, updateRecord, deleteRecord } = require("../controllers/medicalRecordController");

router.post("/", verifyToken, validate(v.createMedicalRecordSchema), createRecord);
router.get("/pet/:petId", verifyToken, getRecordsByPet);
router.get("/:id", verifyToken, getRecordById);
router.put("/:id", verifyToken, updateRecord);
router.delete("/:id", verifyToken, deleteRecord);

module.exports = router;
