const prisma = require("../config/prisma");
const asyncHandler = require("../middleware/asyncHandler");
const AppError = require("../middleware/errors");
const { requirePetAccess, assertPetAccess } = require("../utils/petAccess");

exports.addVaccination = asyncHandler(async (req, res) => {
  const { petId, vaccineName, vaccinationDate, nextDueDate, notes } = req.body;

  await requirePetAccess(req.user, petId);

  const vaccination = await prisma.vaccination.create({
    data: {
      petId,
      vaccineName,
      vaccinationDate: new Date(vaccinationDate),
      nextDueDate: nextDueDate ? new Date(nextDueDate) : null,
      notes,
    },
  });

  res.status(201).json({ success: true, data: vaccination });
});

exports.getVaccinationsByPet = asyncHandler(async (req, res) => {
  await requirePetAccess(req.user, req.params.petId);

  const vaccinations = await prisma.vaccination.findMany({
    where: { petId: req.params.petId },
    orderBy: { vaccinationDate: "desc" },
  });

  res.json({ success: true, data: vaccinations });
});

exports.updateVaccination = asyncHandler(async (req, res) => {
  const vacc = await prisma.vaccination.findUnique({
    where: { id: req.params.id },
    include: { pet: { select: { ownerId: true } } },
  });
  if (!vacc) throw new AppError("Vaccination not found", 404);
  assertPetAccess(req.user, vacc.pet);

  const { vaccineName, vaccinationDate, nextDueDate, notes } = req.body;

  const updated = await prisma.vaccination.update({
    where: { id: req.params.id },
    data: {
      vaccineName,
      vaccinationDate: vaccinationDate ? new Date(vaccinationDate) : undefined,
      nextDueDate: nextDueDate ? new Date(nextDueDate) : undefined,
      notes,
    },
  });

  res.json({ success: true, data: updated });
});

exports.deleteVaccination = asyncHandler(async (req, res) => {
  const vacc = await prisma.vaccination.findUnique({
    where: { id: req.params.id },
    include: { pet: { select: { ownerId: true } } },
  });
  if (!vacc) throw new AppError("Vaccination not found", 404);
  assertPetAccess(req.user, vacc.pet);

  await prisma.vaccination.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: "Vaccination record deleted" });
});
