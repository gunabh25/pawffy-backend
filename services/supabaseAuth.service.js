const prisma = require("../config/prisma");
const { getSupabaseAdmin } = require("../config/supabase");
const AppError = require("../middleware/errors");
const { signToken, sanitizeUser } = require("../utils/auth");

function normalizePhone(phone) {
  if (!phone) return null;
  const trimmed = String(phone).trim();
  return trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
}

async function verifySupabaseAccessToken(accessToken) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data?.user) {
    throw new AppError("Invalid or expired Supabase session", 401);
  }

  const authUser = data.user;
  const phone = normalizePhone(authUser.phone);

  if (!phone) {
    throw new AppError("A verified phone number is required. Complete Supabase phone OTP first.", 400);
  }

  if (!authUser.phone_confirmed_at) {
    throw new AppError("Phone number is not verified in Supabase", 400);
  }

  return {
    supabaseId: authUser.id,
    phone,
    email: authUser.email ? authUser.email.toLowerCase() : null,
    emailVerifiedAt: authUser.email_confirmed_at ? new Date(authUser.email_confirmed_at) : null,
    metadataName: authUser.user_metadata?.name || authUser.user_metadata?.full_name || null,
  };
}

async function findUserForSupabaseAuth({ supabaseId, phone, email }, { includePartner = false } = {}) {
  const include = includePartner ? { partnerBusiness: true } : undefined;

  const bySupabaseId = await prisma.user.findUnique({ where: { supabaseId }, include });
  if (bySupabaseId) return bySupabaseId;

  const byPhone = await prisma.user.findUnique({ where: { phone }, include });
  if (byPhone) {
    if (byPhone.supabaseId && byPhone.supabaseId !== supabaseId) {
      throw new AppError("This phone number is linked to another account", 409);
    }
    if (email) {
      const emailOwner = await prisma.user.findUnique({ where: { email } });
      if (emailOwner && emailOwner.id !== byPhone.id) {
        throw new AppError(
          "This email is already linked to another account. Omit email on session or use a different email.",
          409
        );
      }
    }
    return byPhone;
  }

  if (email) {
    const byEmail = await prisma.user.findUnique({ where: { email }, include });
    if (byEmail) {
      if (byEmail.supabaseId && byEmail.supabaseId !== supabaseId) {
        throw new AppError("This email is linked to another account", 409);
      }
      return byEmail;
    }
  }

  return null;
}

async function assertUniqueContactFields({ userId, email, phone }) {
  if (email) {
    const emailOwner = await prisma.user.findUnique({ where: { email } });
    if (emailOwner && emailOwner.id !== userId) {
      throw new AppError(
        "This email is already linked to another account. Omit email on session or use a different email.",
        409
      );
    }
  }

  if (phone) {
    const phoneOwner = await prisma.user.findUnique({ where: { phone } });
    if (phoneOwner && phoneOwner.id !== userId) {
      throw new AppError("This phone number is linked to another account", 409);
    }
  }
}

async function upsertUserFromSupabase({
  supabaseId,
  phone,
  email,
  emailVerifiedAt,
  name,
  role = "customer",
}) {
  const existing = await findUserForSupabaseAuth({ supabaseId, phone, email });
  const now = new Date();

  if (existing) {
    if (existing.role === "partner" && role === "customer") {
      // Existing vendor signing in through customer flow — allow login.
    } else if (existing.role !== role && role === "partner") {
      throw new AppError("An account already exists with this phone number", 409);
    }

    await assertUniqueContactFields({
      userId: existing.id,
      email: email && email !== existing.email ? email : null,
      phone: phone !== existing.phone ? phone : null,
    });

    return prisma.user.update({
      where: { id: existing.id },
      data: {
        supabaseId,
        phone,
        phoneVerifiedAt: existing.phoneVerifiedAt || now,
        ...(email ? { email } : {}),
        ...(emailVerifiedAt ? { emailVerifiedAt } : {}),
        ...(name && !existing.name ? { name } : {}),
      },
    });
  }

  if (email) {
    const emailOwner = await prisma.user.findUnique({ where: { email } });
    if (emailOwner) {
      throw new AppError(
        "This email is already linked to another account. Omit email on session or use a different email.",
        409
      );
    }
  }

  const phoneOwner = await prisma.user.findUnique({ where: { phone } });
  if (phoneOwner) {
    throw new AppError("This phone number is linked to another account", 409);
  }

  return prisma.user.create({
    data: {
      supabaseId,
      phone,
      phoneVerifiedAt: now,
      email: email || null,
      emailVerifiedAt: emailVerifiedAt || null,
      name: name || null,
      role,
    },
  });
}

async function exchangeSession({ accessToken, name, email }) {
  const verified = await verifySupabaseAccessToken(accessToken);
  const resolvedEmail = (email || verified.email || null)?.toLowerCase() || null;
  const resolvedName = name || verified.metadataName || null;

  const user = await upsertUserFromSupabase({
    supabaseId: verified.supabaseId,
    phone: verified.phone,
    email: resolvedEmail,
    emailVerifiedAt: verified.emailVerifiedAt,
    name: resolvedName,
    role: "customer",
  });

  return { user: sanitizeUser(user), token: signToken(user) };
}

async function registerVendor({ accessToken, name, email, acceptTerms }) {
  if (!acceptTerms) {
    throw new AppError("You must agree to the Terms & Conditions", 400);
  }

  const verified = await verifySupabaseAccessToken(accessToken);
  const resolvedEmail = (email || verified.email || null)?.toLowerCase() || null;

  if (!resolvedEmail) {
    throw new AppError("Email is required for vendor registration", 400);
  }

  if (!name || name.trim().length < 2) {
    throw new AppError("Name is required for vendor registration", 400);
  }

  const existing = await findUserForSupabaseAuth({
    supabaseId: verified.supabaseId,
    phone: verified.phone,
    email: resolvedEmail,
  }, { includePartner: true });

  if (existing?.partnerBusiness) {
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        supabaseId: verified.supabaseId,
        phone: verified.phone,
        phoneVerifiedAt: existing.phoneVerifiedAt || new Date(),
        email: resolvedEmail,
        name: name.trim(),
      },
    });
    return { user: sanitizeUser(user), token: signToken(user) };
  }

  if (existing && existing.role !== "partner") {
    throw new AppError("An account already exists with this phone number", 409);
  }

  const user = await prisma.$transaction(async (tx) => {
    const baseUser = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: {
            supabaseId: verified.supabaseId,
            phone: verified.phone,
            phoneVerifiedAt: existing.phoneVerifiedAt || new Date(),
            email: resolvedEmail,
            name: name.trim(),
            role: "partner",
          },
        })
      : await tx.user.create({
          data: {
            supabaseId: verified.supabaseId,
            phone: verified.phone,
            phoneVerifiedAt: new Date(),
            email: resolvedEmail,
            name: name.trim(),
            role: "partner",
          },
        });

    await tx.partnerBusiness.create({
      data: {
        userId: baseUser.id,
        contactName: name.trim(),
        phone: verified.phone,
        termsAcceptedAt: new Date(),
        onboardingStep: "business",
        verificationStatus: "incomplete",
      },
    });

    return baseUser;
  });

  return { user: sanitizeUser(user), token: signToken(user) };
}

module.exports = {
  exchangeSession,
  registerVendor,
};
