const prisma = require("../config/prisma");
const { getSupabaseAdmin } = require("../config/supabase");
const AppError = require("../middleware/errors");
const logger = require("../utils/logger");

async function deleteAccount(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      supabaseId: true,
      role: true,
      partnerBusiness: { select: { id: true, verificationStatus: true } },
    },
  });

  if (!user) throw new AppError("Account not found", 404);

  const activePartnerBooking = await prisma.partnerBooking.count({
    where: {
      customerId: userId,
      status: { in: ["pending", "confirmed"] },
    },
  });
  if (activePartnerBooking > 0) {
    throw new AppError("Cannot delete account with active service bookings", 409);
  }

  if (user.partnerBusiness && user.partnerBusiness.verificationStatus === "verified") {
    throw new AppError("Vendor accounts must contact support to delete a verified business profile", 409);
  }

  if (user.supabaseId && process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    try {
      const supabase = getSupabaseAdmin();
      await supabase.auth.admin.deleteUser(user.supabaseId);
    } catch (err) {
      logger.error({ event: "SUPABASE_USER_DELETE_FAILED", userId, error: err.message });
      throw new AppError("Failed to delete auth account. Please try again or contact support.", 502);
    }
  }

  await prisma.user.delete({ where: { id: userId } });
}

module.exports = { deleteAccount };
