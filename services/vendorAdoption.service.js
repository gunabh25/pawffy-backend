const prisma = require("../config/prisma");
const AppError = require("../middleware/errors");
const { getStripe } = require("../config/stripe");

const ADOPTION_FEE = 150;
const ADOPTION_STATUSES = [
  "pending_review",
  "info_requested",
  "rejected",
  "meet_approved",
  "meet_scheduled",
  "not_ready_yet",
  "approved",
  "declined",
  "documents_pending",
  "payment_pending",
  "completed",
];
const DOCUMENT_TYPES = [
  "adoption_agreement",
  "vaccination_record",
  "transfer_certificate",
  "identity_proof",
  "address_proof",
  "other",
];

function numberOrNull(value) {
  return value == null ? null : Number(value);
}

function dataUrlFromFile(file) {
  return `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
}

function adoptionSelect() {
  return {
    id: true,
    businessId: true,
    petId: true,
    applicantId: true,
    status: true,
    reviewDecision: true,
    reviewNotes: true,
    rejectionReason: true,
    applicationData: true,
    applicantProfile: true,
    meetApprovedAt: true,
    meetScheduledFor: true,
    meetTimeSlot: true,
    meetingType: true,
    meetingNotes: true,
    meetOutcome: true,
    meetOutcomeNotes: true,
    meetOutcomeAt: true,
    approvedAt: true,
    declinedAt: true,
    completedAt: true,
    requestedInfoAt: true,
    feeAmount: true,
    createdAt: true,
    updatedAt: true,
    pet: {
      select: {
        id: true,
        name: true,
        species: true,
        breed: true,
        gender: true,
        age: true,
        color: true,
        imageUrl: true,
        vaccinationStatus: true,
      },
    },
    applicant: {
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        profileImage: true,
      },
    },
    documents: {
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        documentType: true,
        fileName: true,
        mimeType: true,
        createdAt: true,
      },
    },
    payment: {
      select: {
        id: true,
        subtotal: true,
        platformFee: true,
        taxAmount: true,
        discount: true,
        couponCode: true,
        amount: true,
        pawPoints: true,
        paymentMethod: true,
        paymentStatus: true,
        transactionId: true,
        paidAt: true,
        createdAt: true,
        updatedAt: true,
      },
    },
  };
}

function serializeAdoption(adoption, { includeDetails = false } = {}) {
  const pet = adoption.pet || {};
  const applicant = adoption.applicant || {};
  const payment = adoption.payment
    ? {
        ...adoption.payment,
        subtotal: Number(adoption.payment.subtotal),
        platformFee: Number(adoption.payment.platformFee),
        taxAmount: Number(adoption.payment.taxAmount),
        discount: Number(adoption.payment.discount),
        amount: Number(adoption.payment.amount),
      }
    : null;

  const base = {
    id: adoption.id,
    status: adoption.status,
    reviewDecision: adoption.reviewDecision,
    reviewNotes: adoption.reviewNotes,
    rejectionReason: adoption.rejectionReason,
    feeAmount: Number(adoption.feeAmount || ADOPTION_FEE),
    createdAt: adoption.createdAt,
    updatedAt: adoption.updatedAt,
    pet: {
      id: pet.id,
      name: pet.name,
      species: pet.species,
      breed: pet.breed,
      gender: pet.gender,
      age: pet.age,
      color: pet.color,
      imageUrl: pet.imageUrl,
      vaccinationStatus: pet.vaccinationStatus,
    },
    applicant: {
      id: applicant.id,
      name: applicant.name,
      email: applicant.email,
      phone: applicant.phone,
      address: applicant.address,
      city: applicant.city,
      state: applicant.state,
      profileImage: applicant.profileImage,
    },
    meeting: {
      approvedAt: adoption.meetApprovedAt,
      scheduledFor: adoption.meetScheduledFor,
      timeSlot: adoption.meetTimeSlot,
      meetingType: adoption.meetingType,
      notes: adoption.meetingNotes,
      outcome: adoption.meetOutcome,
      outcomeNotes: adoption.meetOutcomeNotes,
      outcomeAt: adoption.meetOutcomeAt,
    },
    payment,
    documentCount: adoption.documents?.length || 0,
  };

  if (!includeDetails) return base;

  return {
    ...base,
    applicationData: adoption.applicationData || {},
    applicantProfile: adoption.applicantProfile || {},
    requestedInfoAt: adoption.requestedInfoAt,
    approvedAt: adoption.approvedAt,
    declinedAt: adoption.declinedAt,
    completedAt: adoption.completedAt,
    documents: adoption.documents || [],
  };
}

async function getBusinessOrThrow(userId) {
  const business = await prisma.partnerBusiness.findUnique({
    where: { userId },
    select: {
      id: true,
      userId: true,
      verificationStatus: true,
      businessName: true,
    },
  });

  if (!business) throw new AppError("Vendor business profile not found", 404);
  if (business.verificationStatus !== "verified") {
    throw new AppError("You can access adoption features only after approval", 403);
  }
  return business;
}

async function getAdoptionOrThrow(userId, adoptionId) {
  const business = await getBusinessOrThrow(userId);
  const adoption = await prisma.adoptionApplication.findFirst({
    where: { id: adoptionId, businessId: business.id },
    select: adoptionSelect(),
  });

  if (!adoption) throw new AppError("Adoption application not found", 404);
  return { business, adoption };
}

function assertStatus(adoption, allowed) {
  if (!allowed.includes(adoption.status)) {
    throw new AppError(`Action not allowed when adoption status is ${adoption.status}`, 400);
  }
}

async function createApplicantNotification(userId, title, message) {
  await prisma.notification.create({
    data: {
      userId,
      title,
      message,
      type: "general",
    },
  });
}

async function listAdoptions(userId, { status, search }) {
  const business = await getBusinessOrThrow(userId);

  const where = {
    businessId: business.id,
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { applicant: { name: { contains: search, mode: "insensitive" } } },
            { pet: { name: { contains: search, mode: "insensitive" } } },
            { pet: { breed: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const adoptions = await prisma.adoptionApplication.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: adoptionSelect(),
  });

  return {
    items: adoptions.map((adoption) => serializeAdoption(adoption)),
    filters: {
      availableStatuses: ADOPTION_STATUSES,
      activeStatus: status || null,
      search: search || "",
    },
  };
}

async function getAdoptionDetail(userId, adoptionId) {
  const { adoption } = await getAdoptionOrThrow(userId, adoptionId);
  return serializeAdoption(adoption, { includeDetails: true });
}

async function reviewAdoption(userId, adoptionId, { decision, notes, rejectionReason }) {
  const { adoption } = await getAdoptionOrThrow(userId, adoptionId);
  assertStatus(adoption, ["pending_review", "info_requested"]);

  let nextStatus;
  let notificationMessage;
  const updateData = {
    reviewDecision: decision,
    reviewNotes: notes || null,
    rejectionReason: null,
    requestedInfoAt: null,
  };

  if (decision === "approve_to_meet") {
    nextStatus = "meet_approved";
    updateData.meetApprovedAt = new Date();
    notificationMessage = "Your adoption application has been approved for a meet and greet.";
  } else if (decision === "request_info") {
    nextStatus = "info_requested";
    updateData.requestedInfoAt = new Date();
    notificationMessage = "The vendor requested more information for your adoption application.";
  } else {
    nextStatus = "rejected";
    updateData.rejectionReason = rejectionReason || "Application rejected";
    notificationMessage = updateData.rejectionReason;
  }

  const updated = await prisma.adoptionApplication.update({
    where: { id: adoption.id },
    data: {
      ...updateData,
      status: nextStatus,
      ...(decision !== "approve_to_meet" && {
        meetScheduledFor: null,
        meetTimeSlot: null,
        meetingType: null,
        meetingNotes: null,
      }),
    },
    select: adoptionSelect(),
  });

  await createApplicantNotification(
    adoption.applicantId,
    "Adoption application updated",
    notificationMessage
  );

  return serializeAdoption(updated, { includeDetails: true });
}

async function scheduleMeet(userId, adoptionId, { date, timeSlot, meetingType, notes }) {
  const { adoption } = await getAdoptionOrThrow(userId, adoptionId);
  assertStatus(adoption, ["meet_approved", "not_ready_yet"]);

  const scheduledFor = new Date(`${date}T00:00:00.000Z`);
  const updated = await prisma.adoptionApplication.update({
    where: { id: adoption.id },
    data: {
      status: "meet_scheduled",
      meetScheduledFor: scheduledFor,
      meetTimeSlot: timeSlot,
      meetingType,
      meetingNotes: notes || null,
    },
    select: adoptionSelect(),
  });

  await createApplicantNotification(
    adoption.applicantId,
    "Meet and greet scheduled",
    `Your adoption meet and greet is scheduled for ${date} (${timeSlot}).`
  );

  return serializeAdoption(updated, { includeDetails: true });
}

async function recordMeetOutcome(userId, adoptionId, { outcome, notes }) {
  const { adoption } = await getAdoptionOrThrow(userId, adoptionId);
  assertStatus(adoption, ["meet_scheduled"]);

  const updateData = {
    meetOutcome: outcome,
    meetOutcomeNotes: notes || null,
    meetOutcomeAt: new Date(),
  };

  if (outcome === "approve_adoption") {
    updateData.status = "documents_pending";
    updateData.approvedAt = new Date();
  } else if (outcome === "decline") {
    updateData.status = "declined";
    updateData.declinedAt = new Date();
  } else {
    updateData.status = "not_ready_yet";
  }

  const updated = await prisma.adoptionApplication.update({
    where: { id: adoption.id },
    data: updateData,
    select: adoptionSelect(),
  });

  const messages = {
    approve_adoption: "Your adoption application was approved. Please complete the final paperwork and payment.",
    decline: "Your adoption application was declined after the meet and greet.",
    not_ready_yet: "The vendor marked your adoption application as not ready yet. They may reschedule or follow up with next steps.",
  };
  await createApplicantNotification(adoption.applicantId, "Meet outcome recorded", messages[outcome]);

  return serializeAdoption(updated, { includeDetails: true });
}

async function uploadDocuments(userId, adoptionId, files, { documentType }) {
  const { adoption } = await getAdoptionOrThrow(userId, adoptionId);
  assertStatus(adoption, ["documents_pending", "payment_pending", "approved"]);

  if (!files?.length) {
    throw new AppError("No adoption document file provided. Send field name: document", 400);
  }

  await prisma.$transaction(async (tx) => {
    for (const file of files) {
      await tx.adoptionDocument.create({
        data: {
          adoptionId: adoption.id,
          documentType: documentType || "other",
          fileName: file.originalname || "document",
          mimeType: file.mimetype,
          fileData: dataUrlFromFile(file),
        },
      });
    }

    await tx.adoptionApplication.update({
      where: { id: adoption.id },
      data: { status: "payment_pending" },
    });
  });

  return getAdoptionDetail(userId, adoptionId);
}

async function buildAdoptionPriceSummary(adoption, couponCode) {
  const baseAmount = Number(adoption.feeAmount || ADOPTION_FEE);
  let discount = 0;
  let appliedCoupon = null;

  if (couponCode) {
    const coupon = await prisma.coupon.findUnique({
      where: { code: couponCode.toUpperCase() },
    });
    if (coupon && coupon.isActive && (!coupon.expiresAt || coupon.expiresAt > new Date())) {
      if (!coupon.maxUses || coupon.usedCount < coupon.maxUses) {
        discount = coupon.isPercent
          ? parseFloat(((baseAmount * Number(coupon.discount)) / 100).toFixed(2))
          : Number(coupon.discount);
        appliedCoupon = coupon;
      }
    }
  }

  const total = Math.max(0, parseFloat((baseAmount - discount).toFixed(2)));
  return {
    subtotal: baseAmount,
    platformFee: 0,
    taxAmount: 0,
    discount,
    total,
    pawPoints: 0,
    appliedCoupon,
  };
}

async function finalizeAdoptionPayment(adoptionId, paymentId) {
  await prisma.$transaction([
    prisma.adoptionPayment.update({
      where: { id: paymentId },
      data: { paymentStatus: "paid", paidAt: new Date() },
    }),
    prisma.adoptionApplication.update({
      where: { id: adoptionId },
      data: { status: "completed", completedAt: new Date() },
    }),
  ]);
}

async function collectPayment(userId, adoptionId, payload) {
  const { adoption } = await getAdoptionOrThrow(userId, adoptionId);
  assertStatus(adoption, ["approved", "documents_pending", "payment_pending"]);

  if (!adoption.documents?.length) {
    throw new AppError("Upload adoption documents before collecting payment", 400);
  }

  if (payload.paymentIntentId) {
    const payment = await prisma.adoptionPayment.findFirst({
      where: { adoptionId: adoption.id, transactionId: payload.paymentIntentId },
    });
    if (!payment) throw new AppError("Payment record not found", 404);

    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(payload.paymentIntentId);
    if (intent.status === "succeeded" && payment.paymentStatus !== "paid") {
      await finalizeAdoptionPayment(adoption.id, payment.id);
    }

    const refreshed = await getAdoptionDetail(userId, adoption.id);
    return {
      mode: "verify",
      stripeStatus: intent.status,
      adoption: refreshed,
    };
  }

  const summary = await buildAdoptionPriceSummary(adoption, payload.couponCode);
  if (summary.appliedCoupon) {
    await prisma.coupon.update({
      where: { id: summary.appliedCoupon.id },
      data: { usedCount: { increment: 1 } },
    });
  }

  if (payload.paymentMethod === "wallet") {
    if (process.env.WALLET_PAYMENTS_ENABLED !== "true") {
      throw new AppError("Wallet payments are not enabled", 503);
    }

    const payment = await prisma.adoptionPayment.upsert({
      where: { adoptionId: adoption.id },
      update: {
        subtotal: summary.subtotal,
        platformFee: summary.platformFee,
        taxAmount: summary.taxAmount,
        discount: summary.discount,
        couponCode: payload.couponCode || null,
        amount: summary.total,
        pawPoints: summary.pawPoints,
        paymentMethod: "wallet",
        paymentStatus: "paid",
        paidAt: new Date(),
      },
      create: {
        adoptionId: adoption.id,
        subtotal: summary.subtotal,
        platformFee: summary.platformFee,
        taxAmount: summary.taxAmount,
        discount: summary.discount,
        couponCode: payload.couponCode || null,
        amount: summary.total,
        pawPoints: summary.pawPoints,
        paymentMethod: "wallet",
        paymentStatus: "paid",
        paidAt: new Date(),
      },
    });

    await prisma.adoptionApplication.update({
      where: { id: adoption.id },
      data: { status: "completed", completedAt: new Date() },
    });

    return {
      mode: "wallet",
      adoption: await getAdoptionDetail(userId, adoption.id),
      payment: {
        id: payment.id,
        amount: Number(payment.amount),
        paymentStatus: payment.paymentStatus,
        paidAt: payment.paidAt,
      },
    };
  }

  const stripe = getStripe();
  const amountInPaise = Math.round(summary.total * 100);
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountInPaise,
    currency: "inr",
    payment_method_types: payload.paymentMethod === "net_banking" ? ["netbanking"] : ["card"],
    metadata: {
      adoptionId: adoption.id,
      applicantId: adoption.applicantId,
      couponCode: payload.couponCode || "",
      paymentMethod: payload.paymentMethod,
    },
    description: `Pawffy adoption fee – ${adoption.pet?.name || "Pet adoption"}`,
  });

  await prisma.adoptionPayment.upsert({
    where: { adoptionId: adoption.id },
    update: {
      subtotal: summary.subtotal,
      platformFee: summary.platformFee,
      taxAmount: summary.taxAmount,
      discount: summary.discount,
      couponCode: payload.couponCode || null,
      amount: summary.total,
      pawPoints: summary.pawPoints,
      paymentMethod: payload.paymentMethod,
      paymentStatus: "pending",
      transactionId: paymentIntent.id,
      paidAt: null,
    },
    create: {
      adoptionId: adoption.id,
      subtotal: summary.subtotal,
      platformFee: summary.platformFee,
      taxAmount: summary.taxAmount,
      discount: summary.discount,
      couponCode: payload.couponCode || null,
      amount: summary.total,
      pawPoints: summary.pawPoints,
      paymentMethod: payload.paymentMethod,
      paymentStatus: "pending",
      transactionId: paymentIntent.id,
    },
  });

  await prisma.adoptionApplication.update({
    where: { id: adoption.id },
    data: { status: "payment_pending" },
  });

  return {
    mode: "intent",
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    amount: summary.total,
    amountInPaise,
    currency: "inr",
    adoption: await getAdoptionDetail(userId, adoption.id),
  };
}

module.exports = {
  ADOPTION_STATUSES,
  DOCUMENT_TYPES,
  listAdoptions,
  getAdoptionDetail,
  reviewAdoption,
  scheduleMeet,
  recordMeetOutcome,
  uploadDocuments,
  collectPayment,
};
