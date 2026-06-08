const prisma = require("../config/prisma");
const asyncHandler = require("../middleware/asyncHandler");

exports.createRecord = asyncHandler(async (req, res) => {
  const { petId, diagnosis, prescription, allergies, symptoms, reportUrl } = req.body;

  if (!petId) return res.status(400).json({ success: false, message: "petId is required" });

  const pet = await prisma.pet.findUnique({ where: { id: petId } });
  if (!pet) return res.status(404).json({ success: false, message: "Pet not found" });

  const record = await prisma.medicalRecord.create({
    data: {
      petId,
      diagnosis,
      prescription,
      allergies,
      symptoms,
      reportUrl,
      createdByVet: req.user.role === "vet" ? req.user.id : null,
    },
  });

  res.status(201).json({ success: true, data: record });
});

exports.getRecordsByPet = asyncHandler(async (req, res) => {
  const pet = await prisma.pet.findUnique({ where: { id: req.params.petId } });
  if (!pet) return res.status(404).json({ success: false, message: "Pet not found" });

  if (pet.ownerId !== req.user.id && req.user.role !== "admin" && req.user.role !== "vet") {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  const records = await prisma.medicalRecord.findMany({
    where: { petId: req.params.petId },
    orderBy: { createdAt: "desc" },
  });

  res.json({ success: true, data: records });
});

exports.getRecordById = asyncHandler(async (req, res) => {
  const record = await prisma.medicalRecord.findUnique({
    where: { id: req.params.id },
    include: { pet: { select: { id: true, name: true, ownerId: true } } },
  });

  if (!record) return res.status(404).json({ success: false, message: "Record not found" });
  if (record.pet.ownerId !== req.user.id && req.user.role !== "admin" && req.user.role !== "vet") {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  res.json({ success: true, data: record });
});

exports.updateRecord = asyncHandler(async (req, res) => {
  const record = await prisma.medicalRecord.findUnique({ where: { id: req.params.id } });
  if (!record) return res.status(404).json({ success: false, message: "Record not found" });

  const { diagnosis, prescription, allergies, symptoms, reportUrl } = req.body;

  const updated = await prisma.medicalRecord.update({
    where: { id: req.params.id },
    data: { diagnosis, prescription, allergies, symptoms, reportUrl },
  });

  res.json({ success: true, data: updated });
});

exports.deleteRecord = asyncHandler(async (req, res) => {
  const record = await prisma.medicalRecord.findUnique({ where: { id: req.params.id } });
  if (!record) return res.status(404).json({ success: false, message: "Record not found" });

  await prisma.medicalRecord.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: "Record deleted" });
});
