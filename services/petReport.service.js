const prisma = require("../config/prisma");
const AppError = require("../middleware/errors");
const { assertOwnerOrAdmin } = require("../utils/petAccess");

function formatReport(report) {
  return {
    id: report.id,
    userId: report.userId,
    postType: report.postType,
    name: report.name,
    age: report.age,
    color: report.color,
    height: report.height,
    weight: report.weight,
    breed: report.breed,
    gender: report.gender,
    description: report.description,
    images: report.images,
    location: {
      latitude: Number(report.latitude),
      longitude: Number(report.longitude),
      address: report.address,
    },
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}

function toReportData(userId, postType, body) {
  const { location, ...rest } = body;
  return {
    userId,
    postType,
    name: rest.name ?? null,
    age: rest.age ?? null,
    color: rest.color,
    height: rest.height ?? null,
    weight: rest.weight ?? null,
    breed: rest.breed,
    gender: rest.gender,
    description: rest.description,
    images: rest.images,
    latitude: location.latitude,
    longitude: location.longitude,
    address: location.address,
  };
}

async function getReportOrThrow(id) {
  const report = await prisma.petReport.findUnique({ where: { id } });
  if (!report) throw new AppError("Report not found", 404);
  return report;
}

async function assertReportAccess(req, report) {
  assertOwnerOrAdmin(req, report.userId);
}

async function createReport(userId, postType, body) {
  const report = await prisma.petReport.create({
    data: toReportData(userId, postType, body),
  });
  return formatReport(report);
}

async function listReports(postType) {
  const reports = await prisma.petReport.findMany({
    where: postType ? { postType } : undefined,
    orderBy: { createdAt: "desc" },
  });
  return reports.map(formatReport);
}

async function getReportById(id) {
  const report = await getReportOrThrow(id);
  return formatReport(report);
}

async function updateReport(req, id, body) {
  const report = await getReportOrThrow(id);
  assertReportAccess(req, report);

  if (report.postType === "Lost" && body.postType && body.postType !== "Lost") {
    throw new AppError("Cannot change lost report to found", 400);
  }
  if (report.postType === "Found" && body.postType && body.postType !== "Found") {
    throw new AppError("Cannot change found report to lost", 400);
  }

  const { location, ...rest } = body;
  const data = {
    ...(rest.name !== undefined && { name: rest.name }),
    ...(rest.age !== undefined && { age: rest.age }),
    ...(rest.color !== undefined && { color: rest.color }),
    ...(rest.height !== undefined && { height: rest.height }),
    ...(rest.weight !== undefined && { weight: rest.weight }),
    ...(rest.breed !== undefined && { breed: rest.breed }),
    ...(rest.gender !== undefined && { gender: rest.gender }),
    ...(rest.description !== undefined && { description: rest.description }),
    ...(rest.images !== undefined && { images: rest.images }),
    ...(location && {
      latitude: location.latitude,
      longitude: location.longitude,
      address: location.address,
    }),
  };

  const updated = await prisma.petReport.update({ where: { id }, data });
  return formatReport(updated);
}

async function deleteReport(req, id) {
  const report = await getReportOrThrow(id);
  assertReportAccess(req, report);
  const formatted = formatReport(report);
  await prisma.petReport.delete({ where: { id } });
  return formatted;
}

async function getAllReportsGrouped() {
  const reports = await prisma.petReport.findMany({ orderBy: { createdAt: "desc" } });
  const formatted = reports.map(formatReport);
  const lostPets = formatted.filter((r) => r.postType === "Lost");
  const foundPets = formatted.filter((r) => r.postType === "Found");

  return {
    total: formatted.length,
    lostCount: lostPets.length,
    foundCount: foundPets.length,
    lostPets,
    foundPets,
  };
}

module.exports = {
  createReport,
  listReports,
  getReportById,
  updateReport,
  deleteReport,
  getAllReportsGrouped,
};
