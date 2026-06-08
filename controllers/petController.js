const prisma = require("../config/prisma");
const asyncHandler = require("../middleware/asyncHandler");

exports.createPet = asyncHandler(async (req, res) => {
  const { name, species, breed, gender, age, weight, color, medicalNotes, vaccinationStatus, imageUrl } = req.body;

  if (!name || !species) {
    return res.status(400).json({ success: false, message: "name and species are required" });
  }

  const pet = await prisma.pet.create({
    data: {
      ownerId: req.user.id,
      name, species, breed, gender,
      age: age ? parseInt(age) : null,
      weight: weight ? parseFloat(weight) : null,
      color, medicalNotes, vaccinationStatus, imageUrl,
    },
  });

  res.status(201).json({ success: true, data: pet });
});

exports.getMyPets = asyncHandler(async (req, res) => {
  const pets = await prisma.pet.findMany({
    where: { ownerId: req.user.id },
    include: {
      vaccinations: { orderBy: { vaccinationDate: "desc" }, take: 1 },
      _count: { select: { medicalRecords: true, bookings: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({ success: true, data: pets });
});

exports.getPetById = asyncHandler(async (req, res) => {
  const pet = await prisma.pet.findUnique({
    where: { id: req.params.id },
    include: {
      owner: { select: { id: true, name: true, email: true, phone: true } },
      vaccinations: { orderBy: { vaccinationDate: "desc" } },
      medicalRecords: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!pet) return res.status(404).json({ success: false, message: "Pet not found" });
  if (pet.ownerId !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  res.json({ success: true, data: pet });
});

exports.updatePet = asyncHandler(async (req, res) => {
  const pet = await prisma.pet.findUnique({ where: { id: req.params.id } });
  if (!pet) return res.status(404).json({ success: false, message: "Pet not found" });
  if (pet.ownerId !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  const { name, species, breed, gender, age, weight, color, medicalNotes, vaccinationStatus, imageUrl } = req.body;

  const updated = await prisma.pet.update({
    where: { id: req.params.id },
    data: {
      name, species, breed, gender,
      age: age !== undefined ? parseInt(age) : undefined,
      weight: weight !== undefined ? parseFloat(weight) : undefined,
      color, medicalNotes, vaccinationStatus, imageUrl,
    },
  });

  res.json({ success: true, data: updated });
});

exports.deletePet = asyncHandler(async (req, res) => {
  const pet = await prisma.pet.findUnique({ where: { id: req.params.id } });
  if (!pet) return res.status(404).json({ success: false, message: "Pet not found" });
  if (pet.ownerId !== req.user.id && req.user.role !== "admin") {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  await prisma.pet.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: "Pet deleted" });
});
