const prisma = require("../config/prisma");
const AppError = require("../middleware/errors");

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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

async function getVetOrThrow(vetId) {
  const vet = await prisma.vet.findUnique({ where: { id: vetId } });
  if (!vet) throw new AppError("Vet not found", 404);
  return vet;
}

async function getVetServices(vetId) {
  await getVetOrThrow(vetId);

  return prisma.vetService.findMany({
    where: { vetId, isActive: true },
    orderBy: { price: "asc" },
  });
}

async function createVetService(vetId, { name, description, price, duration }) {
  await getVetOrThrow(vetId);

  return prisma.vetService.create({
    data: {
      vetId,
      name,
      description,
      price: parseFloat(price),
      duration: duration ? parseInt(duration) : 30,
    },
  });
}

async function updateVetService(vetId, serviceId, data) {
  const service = await prisma.vetService.findFirst({
    where: { id: serviceId, vetId },
  });
  if (!service) throw new AppError("Service not found", 404);

  const { name, description, price, duration, isActive } = data;

  return prisma.vetService.update({
    where: { id: serviceId },
    data: {
      name,
      description,
      price: price !== undefined ? parseFloat(price) : undefined,
      duration: duration !== undefined ? parseInt(duration) : undefined,
      isActive,
    },
  });
}

async function deleteVetService(vetId, serviceId) {
  const service = await prisma.vetService.findFirst({
    where: { id: serviceId, vetId },
  });
  if (!service) throw new AppError("Service not found", 404);

  await prisma.vetService.update({
    where: { id: serviceId },
    data: { isActive: false },
  });
}

async function getAvailableSlots(vetId, date) {
  if (!date) throw new AppError("date query param is required (YYYY-MM-DD)", 400);
  await getVetOrThrow(vetId);

  const targetDate = new Date(date);
  if (isNaN(targetDate)) throw new AppError("Invalid date format. Use YYYY-MM-DD", 400);

  const dayOfWeek = DAY_NAMES[targetDate.getDay()];

  const availability = await prisma.vetAvailability.findFirst({
    where: { vetId, dayOfWeek, isAvailable: true },
  });

  if (!availability) {
    return { slots: [], meta: { date, dayOfWeek, total: 0, available: 0, message: `No availability set for ${dayOfWeek}` } };
  }

  const slots = generateTimeSlots(availability.startTime, availability.endTime, availability.slotDuration);

  const bookedSlots = await prisma.booking.findMany({
    where: {
      vetId,
      bookingDate: { gte: new Date(`${date}T00:00:00.000Z`), lt: new Date(`${date}T23:59:59.999Z`) },
      status: { in: ["pending", "confirmed"] },
    },
    select: { bookingTime: true },
  });

  const bookedTimes = new Set(bookedSlots.map((b) => b.bookingTime));
  const result = slots.map((time) => ({ time, available: !bookedTimes.has(time) }));

  return {
    slots: result,
    meta: {
      date,
      dayOfWeek,
      total: slots.length,
      available: result.filter((s) => s.available).length,
    },
  };
}

module.exports = {
  getVetServices,
  createVetService,
  updateVetService,
  deleteVetService,
  getAvailableSlots,
};
