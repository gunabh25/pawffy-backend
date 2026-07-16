const prisma = require("../config/prisma");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../middleware/errors");
const { requirePetAccess, assertPetAccess } = require("../utils/petAccess");

exports.createRecord = asyncHandler(async (req, res) => {
  const { petId, diagnosis, prescription, allergies, symptoms, reportUrl } = req.body;

  const pet = await requirePetAccess(req.user, petId);

  const record = await prisma.medicalRecord.create({
    data: {
      petId: pet.id,
      diagnosis,
      prescription,
      allergies,
      symptoms,
      reportUrl,
    },
  });

  res.status(201).json({ success: true, data: record });
});

exports.getRecordsByPet = asyncHandler(async (req, res) => {
  const pet = await requirePetAccess(req.user, req.params.petId);

  const records = await prisma.medicalRecord.findMany({
    where: { petId: pet.id },
    orderBy: { createdAt: "desc" },
  });

  res.json({ success: true, data: records });
});

exports.getRecordById = asyncHandler(async (req, res) => {
  const record = await prisma.medicalRecord.findUnique({
    where: { id: req.params.id },
    include: { pet: { select: { id: true, name: true, ownerId: true } } },
  });

  if (!record) throw new AppError("Record not found", 404);
  assertPetAccess(req.user, record.pet);

  res.json({ success: true, data: record });
});

exports.updateRecord = asyncHandler(async (req, res) => {
  const record = await prisma.medicalRecord.findUnique({
    where: { id: req.params.id },
    include: { pet: { select: { ownerId: true } } },
  });
  if (!record) throw new AppError("Record not found", 404);
  assertPetAccess(req.user, record.pet);

  const { diagnosis, prescription, allergies, symptoms, reportUrl } = req.body;

  const updated = await prisma.medicalRecord.update({
    where: { id: req.params.id },
    data: { diagnosis, prescription, allergies, symptoms, reportUrl },
  });

  res.json({ success: true, data: updated });
});

exports.deleteRecord = asyncHandler(async (req, res) => {
  const record = await prisma.medicalRecord.findUnique({
    where: { id: req.params.id },
    include: { pet: { select: { ownerId: true } } },
  });
  if (!record) throw new AppError("Record not found", 404);
  assertPetAccess(req.user, record.pet);

  await prisma.medicalRecord.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: "Record deleted" });
});
