const AppError = require("../middleware/errors");

/**
 * Admin can manage any vet profile. Partners may only manage the vet linked to their account email.
 */
function assertVetManagementAccess(req, vet) {
  if (req.user.role === "admin") return;
  if (req.user.role === "partner" && req.user.email && vet.email === req.user.email) return;
  throw new AppError("Access denied", 403);
}

module.exports = { assertVetManagementAccess };
