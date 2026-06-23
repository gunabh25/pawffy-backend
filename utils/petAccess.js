const prisma = require("../config/prisma");
const AppError = require("../middleware/errors");
const { isOwnerOrAdmin } = require("../middleware/rbac");

async function getPetOrThrow(petId) {
  const pet = await prisma.pet.findUnique({ where: { id: petId } });
  if (!pet) throw new AppError("Pet not found", 404);
  return pet;
}

function assertPetAccess(user, pet, { allowVet = false } = {}) {
  if (user.id === pet.ownerId || user.role === "admin") return;
  if (allowVet && user.role === "vet") return;
  throw new AppError("Access denied", 403);
}

async function requirePetAccess(user, petId, options = {}) {
  const pet = await getPetOrThrow(petId);
  assertPetAccess(user, pet, options);
  return pet;
}

function assertOwnerOrAdmin(req, resourceUserId) {
  if (!isOwnerOrAdmin(req, resourceUserId)) {
    throw new AppError("Access denied", 403);
  }
}

module.exports = {
  getPetOrThrow,
  assertPetAccess,
  requirePetAccess,
  assertOwnerOrAdmin,
};
