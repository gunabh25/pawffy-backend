const prisma = require("../config/prisma");
const asyncHandler = require("../middleware/asyncHandler");

exports.addVaccination = asyncHandler(async (req, res) => {
  const { petId, vaccineName, vaccinationDate, nextDueDate, vetId, notes } = req.body;

  if (!petId || !vaccineName || !vaccinationDate) {
    return res.status(400).json({ success: false, message: "petId, vaccineName and vaccinationDate are required" });
  }

  const pet = await prisma.pet.findUnique({ where: { id: petId } });
  if (!pet) return res.status(404).json({ success: false, message: "Pet not found" });
  if (pet.ownerId !== req.user.id && req.user.role !== "admin" && req.user.role !== "vet") {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  const vaccination = await prisma.vaccination.create({
    data: {
      petId,
      vaccineName,
      vaccinationDate: new Date(vaccinationDate),
      nextDueDate: nextDueDate ? new Date(nextDueDate) : null,
      vetId: vetId || null,
      notes,
    },
  });

  res.status(201).json({ success: true, data: vaccination });
});

exports.getVaccinationsByPet = asyncHandler(async (req, res) => {
  const pet = await prisma.pet.findUnique({ where: { id: req.params.petId } });
  if (!pet) return res.status(404).json({ success: false, message: "Pet not found" });

  const vaccinations = await prisma.vaccination.findMany({
    where: { petId: req.params.petId },
    include: { vet: { select: { id: true, name: true, clinicName: true } } },
    orderBy: { vaccinationDate: "desc" },
  });

  res.json({ success: true, data: vaccinations });
});

exports.updateVaccination = asyncHandler(async (req, res) => {
  const vacc = await prisma.vaccination.findUnique({ where: { id: req.params.id } });
  if (!vacc) return res.status(404).json({ success: false, message: "Vaccination not found" });

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
  const vacc = await prisma.vaccination.findUnique({ where: { id: req.params.id } });
  if (!vacc) return res.status(404).json({ success: false, message: "Vaccination not found" });

  await prisma.vaccination.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: "Vaccination record deleted" });
});
