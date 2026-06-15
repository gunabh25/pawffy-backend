const prisma = require("../config/prisma");
const asyncHandler = require("../middleware/asyncHandler");

exports.createVet = asyncHandler(async (req, res) => {
  const { name, email, serviceType, specialization, experienceYears, clinicName, consultationFee, city, state } = req.body;

  if (!name || !email) {
    return res.status(400).json({ success: false, message: "name and email are required" });
  }

  const existing = await prisma.vet.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ success: false, message: "Vet already exists with this email" });

  const vet = await prisma.vet.create({
    data: {
      name, email,
      serviceType: serviceType || "vet",
      specialization,
      experienceYears: experienceYears ? parseInt(experienceYears) : null,
      clinicName,
      consultationFee: consultationFee ? parseFloat(consultationFee) : null,
      city, state,
    },
  });

  res.status(201).json({ success: true, data: vet });
});

exports.getAllVets = asyncHandler(async (req, res) => {
  const { city, specialization, available, serviceType, search } = req.query;

  const vets = await prisma.vet.findMany({
    where: {
      ...(serviceType && { serviceType }),
      ...(city && { city: { contains: city, mode: "insensitive" } }),
      ...(specialization && { specialization: { contains: specialization, mode: "insensitive" } }),
      ...(available === "true" && { availableStatus: true }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { clinicName: { contains: search, mode: "insensitive" } },
        ],
      }),
    },
    include: {
      availability: true,
      _count: { select: { bookings: true, reviews: true } },
    },
    orderBy: { rating: "desc" },
  });

  res.json({ success: true, data: vets });
});

exports.getVetById = asyncHandler(async (req, res) => {
  const vet = await prisma.vet.findUnique({
    where: { id: req.params.id },
    include: {
      availability: true,
      reviews: {
        include: { user: { select: { id: true, name: true, profileImage: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      _count: { select: { reviews: true } },
    },
  });

  if (!vet) return res.status(404).json({ success: false, message: "Vet not found" });
  res.json({ success: true, data: vet });
});

exports.updateVet = asyncHandler(async (req, res) => {
  const vet = await prisma.vet.findUnique({ where: { id: req.params.id } });
  if (!vet) return res.status(404).json({ success: false, message: "Vet not found" });

  const { name, serviceType, specialization, experienceYears, clinicName, consultationFee, rating, city, state, availableStatus } = req.body;

  const updated = await prisma.vet.update({
    where: { id: req.params.id },
    data: {
      name, serviceType, specialization,
      experienceYears: experienceYears !== undefined ? parseInt(experienceYears) : undefined,
      clinicName,
      consultationFee: consultationFee !== undefined ? parseFloat(consultationFee) : undefined,
      rating: rating !== undefined ? parseFloat(rating) : undefined,
      city, state, availableStatus,
    },
  });

  res.json({ success: true, data: updated });
});

exports.setAvailability = asyncHandler(async (req, res) => {
  const { slots } = req.body;

  if (!Array.isArray(slots) || slots.length === 0) {
    return res.status(400).json({ success: false, message: "slots array is required" });
  }

  await prisma.vetAvailability.deleteMany({ where: { vetId: req.params.id } });

  const created = await prisma.vetAvailability.createMany({
    data: slots.map((s) => ({
      vetId: req.params.id,
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime,
      endTime: s.endTime,
      slotDuration: s.slotDuration || 30,
      isAvailable: s.isAvailable !== false,
    })),
  });

  res.json({ success: true, message: `${created.count} slots saved` });
});

exports.getAvailability = asyncHandler(async (req, res) => {
  const slots = await prisma.vetAvailability.findMany({
    where: { vetId: req.params.id },
    orderBy: { dayOfWeek: "asc" },
  });

  res.json({ success: true, data: slots });
});
