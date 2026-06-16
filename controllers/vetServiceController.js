const prisma = require("../config/prisma");
const asyncHandler = require("../middleware/asyncHandler");

// ─── GET /api/vets/:vetId/services ───────────────────────────────────────────
// Returns all active services for a vet (used on Screen 1 - Select Service)
exports.getVetServices = asyncHandler(async (req, res) => {
  const vet = await prisma.vet.findUnique({ where: { id: req.params.vetId } });
  if (!vet) return res.status(404).json({ success: false, message: "Vet not found" });

  const services = await prisma.vetService.findMany({
    where: { vetId: req.params.vetId, isActive: true },
    orderBy: { price: "asc" },
  });

  res.json({ success: true, data: services });
});

// ─── POST /api/vets/:vetId/services ──────────────────────────────────────────
exports.createVetService = asyncHandler(async (req, res) => {
  const { name, description, price, duration } = req.body;
  if (!name || !price) {
    return res.status(400).json({ success: false, message: "name and price are required" });
  }

  const vet = await prisma.vet.findUnique({ where: { id: req.params.vetId } });
  if (!vet) return res.status(404).json({ success: false, message: "Vet not found" });

  const service = await prisma.vetService.create({
    data: {
      vetId: req.params.vetId,
      name,
      description,
      price: parseFloat(price),
      duration: duration ? parseInt(duration) : 30,
    },
  });

  res.status(201).json({ success: true, data: service });
});

// ─── PUT /api/vets/:vetId/services/:serviceId ─────────────────────────────────
exports.updateVetService = asyncHandler(async (req, res) => {
  const { name, description, price, duration, isActive } = req.body;

  const service = await prisma.vetService.findFirst({
    where: { id: req.params.serviceId, vetId: req.params.vetId },
  });
  if (!service) return res.status(404).json({ success: false, message: "Service not found" });

  const updated = await prisma.vetService.update({
    where: { id: req.params.serviceId },
    data: {
      name,
      description,
      price: price !== undefined ? parseFloat(price) : undefined,
      duration: duration !== undefined ? parseInt(duration) : undefined,
      isActive,
    },
  });

  res.json({ success: true, data: updated });
});

// ─── DELETE /api/vets/:vetId/services/:serviceId ──────────────────────────────
exports.deleteVetService = asyncHandler(async (req, res) => {
  const service = await prisma.vetService.findFirst({
    where: { id: req.params.serviceId, vetId: req.params.vetId },
  });
  if (!service) return res.status(404).json({ success: false, message: "Service not found" });

  // Soft-delete: mark as inactive to preserve booking history
  await prisma.vetService.update({
    where: { id: req.params.serviceId },
    data: { isActive: false },
  });

  res.json({ success: true, message: "Service deactivated" });
});

// ─── GET /api/vets/:vetId/slots?date=YYYY-MM-DD ───────────────────────────────
// Returns available time slots for a vet on a specific date (Screen 2 - Schedule)
exports.getAvailableSlots = asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ success: false, message: "date query param is required (YYYY-MM-DD)" });

  const targetDate = new Date(date);
  if (isNaN(targetDate)) return res.status(400).json({ success: false, message: "Invalid date format. Use YYYY-MM-DD" });

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayOfWeek = dayNames[targetDate.getDay()];

  // Get vet's availability for that day
  const availability = await prisma.vetAvailability.findFirst({
    where: { vetId: req.params.vetId, dayOfWeek, isAvailable: true },
  });

  if (!availability) {
    return res.json({ success: true, data: [], message: `No availability set for ${dayOfWeek}` });
  }

  // Generate all slots for the day
  const slots = generateTimeSlots(availability.startTime, availability.endTime, availability.slotDuration);

  // Get already-booked times for that date (pending/confirmed only)
  const bookedSlots = await prisma.booking.findMany({
    where: {
      vetId: req.params.vetId,
      bookingDate: { gte: new Date(`${date}T00:00:00.000Z`), lt: new Date(`${date}T23:59:59.999Z`) },
      status: { in: ["pending", "confirmed"] },
    },
    select: { bookingTime: true },
  });

  const bookedTimes = new Set(bookedSlots.map((b) => b.bookingTime));

  const result = slots.map((time) => ({
    time,
    available: !bookedTimes.has(time),
  }));

  res.json({
    success: true,
    data: result,
    meta: { date, dayOfWeek, total: slots.length, available: result.filter((s) => s.available).length },
  });
});

// ─── Generate time slots from startTime to endTime with slotDuration minutes ──
function generateTimeSlots(startTime, endTime, slotDuration) {
  const slots = [];
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);

  let current = startH * 60 + startM;
  const end = endH * 60 + endM;

  while (current + slotDuration <= end) {
    const h = Math.floor(current / 60);
    const m = current % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    current += slotDuration;
  }

  return slots;
}
