const prisma = require("../config/prisma");
const AppError = require("../middleware/errors");

const STEP_ORDER = ["business", "services", "availability", "documents", "review", "submitted"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const BUSINESS_SELECT = {
  id: true,
  userId: true,
  businessName: true,
  contactName: true,
  phone: true,
  location: true,
  description: true,
  sameDayRequests: true,
  onboardingStep: true,
  verificationStatus: true,
  rejectionReason: true,
  termsAcceptedAt: true,
  submittedAt: true,
  verifiedAt: true,
  createdAt: true,
  updatedAt: true,
};

const SERVICE_SELECT = {
  id: true,
  businessId: true,
  serviceType: true,
  name: true,
  description: true,
  inclusions: true,
  durationMinutes: true,
  priceType: true,
  price: true,
  minPrice: true,
  maxPrice: true,
  serviceLocation: true,
  isActive: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
};

const DOCUMENT_META_SELECT = {
  id: true,
  businessId: true,
  documentType: true,
  fileName: true,
  mimeType: true,
  createdAt: true,
};

function advanceStep(current, target) {
  const currentIdx = STEP_ORDER.indexOf(current);
  const targetIdx = STEP_ORDER.indexOf(target);
  if (current === "submitted") return current;
  return targetIdx > currentIdx ? target : current;
}

function formatPriceDisplay(service) {
  if (service.priceType === "range") {
    return `$${Number(service.minPrice)} - $${Number(service.maxPrice)}`;
  }
  return `$${Number(service.price)}`;
}

function formatAvailabilitySummary(availability, sameDayRequests) {
  if (!availability.length) {
    return { workingDays: [], startTime: null, endTime: null, sameDayRequests, label: null };
  }

  const active = availability.filter((d) => d.isAvailable);
  const workingDays = active.map((d) => d.dayOfWeek);
  const startTime = active[0]?.startTime || null;
  const endTime = active[0]?.endTime || null;

  let label = null;
  if (workingDays.length && startTime && endTime) {
    const indices = workingDays.map((d) => DAYS.indexOf(d)).filter((i) => i >= 0).sort((a, b) => a - b);
    const contiguous = indices.length > 1 && indices.every((v, i) => i === 0 || v === indices[i - 1] + 1);
    const dayLabel = workingDays.length === 1
      ? workingDays[0]
      : contiguous
        ? `${DAYS[indices[0]]}-${DAYS[indices[indices.length - 1]]}`
        : workingDays.join(", ");
    label = `${dayLabel}, ${startTime} - ${endTime}`;
  }

  return { workingDays, startTime, endTime, sameDayRequests, label };
}

function buildProgress(business, counts) {
  const businessDone = Boolean(business.businessName && business.contactName && business.phone && business.location);
  const servicesDone = counts.services > 0;
  const documentsDone = counts.documents > 0;
  const submitted = business.verificationStatus === "pending"
    || business.verificationStatus === "verified"
    || business.onboardingStep === "submitted";

  return [
    {
      key: "business",
      label: "Business Information",
      status: businessDone ? "Submitted" : "Pending",
      completed: businessDone,
    },
    {
      key: "services",
      label: "Services Configured",
      status: servicesDone ? "Completed" : "Pending",
      completed: servicesDone,
    },
    {
      key: "documents",
      label: "Documentation Upload",
      status: documentsDone ? "Completed" : "Pending",
      completed: documentsDone,
    },
    {
      key: "verification",
      label: "Verification",
      status: business.verificationStatus === "verified"
        ? "Completed"
        : business.verificationStatus === "rejected"
          ? "Rejected"
          : submitted
            ? "In Process"
            : "Pending",
      completed: business.verificationStatus === "verified",
    },
  ];
}

async function getOrCreateBusiness(userId) {
  let business = await prisma.partnerBusiness.findUnique({
    where: { userId },
    include: {
      services: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      availability: { orderBy: { dayOfWeek: "asc" } },
      documents: { orderBy: { createdAt: "desc" }, select: DOCUMENT_META_SELECT },
    },
  });

  if (!business) {
    business = await prisma.partnerBusiness.create({
      data: { userId },
      include: {
        services: true,
        availability: true,
        documents: { select: DOCUMENT_META_SELECT },
      },
    });
  }

  return business;
}

function assertOnboardingEditable(business) {
  if (business.verificationStatus === "verified") {
    throw new AppError("Business is already verified. Contact support to update details.", 400);
  }
  if (business.verificationStatus === "pending") {
    throw new AppError("Application is under review and cannot be edited", 400);
  }
}

function assertNotUnderReview(business) {
  if (business.verificationStatus === "pending") {
    throw new AppError("Application is under review and cannot be edited", 400);
  }
}

function rejectionResetData(business) {
  if (business.verificationStatus === "rejected") {
    return { verificationStatus: "incomplete", rejectionReason: null };
  }
  return {};
}

function sortAvailability(slots) {
  return [...slots].sort((a, b) => DAYS.indexOf(a.dayOfWeek) - DAYS.indexOf(b.dayOfWeek));
}

function serializeService(service) {
  return {
    ...service,
    price: service.price != null ? Number(service.price) : null,
    minPrice: service.minPrice != null ? Number(service.minPrice) : null,
    maxPrice: service.maxPrice != null ? Number(service.maxPrice) : null,
    priceDisplay: formatPriceDisplay(service),
  };
}

function serializeOnboarding(business) {
  const services = business.services.map(serializeService);
  const availabilitySlots = sortAvailability(business.availability || []);
  const availabilitySummary = formatAvailabilitySummary(availabilitySlots, business.sameDayRequests);
  const progress = buildProgress(business, {
    services: services.length,
    documents: business.documents.length,
  });

  const isReady =
    business.verificationStatus === "verified"
    || (business.verificationStatus === "pending" && business.onboardingStep === "submitted");

  return {
    business: {
      id: business.id,
      userId: business.userId,
      businessName: business.businessName,
      contactName: business.contactName,
      phone: business.phone,
      location: business.location,
      description: business.description,
      sameDayRequests: business.sameDayRequests,
      onboardingStep: business.onboardingStep,
      verificationStatus: business.verificationStatus,
      rejectionReason: business.rejectionReason,
      termsAcceptedAt: business.termsAcceptedAt,
      submittedAt: business.submittedAt,
      verifiedAt: business.verifiedAt,
      createdAt: business.createdAt,
      updatedAt: business.updatedAt,
    },
    services,
    availability: availabilitySummary,
    availabilitySlots,
    documents: business.documents,
    progress,
    isReady,
    isLive: business.verificationStatus === "verified",
  };
}

async function getOnboarding(userId) {
  const business = await getOrCreateBusiness(userId);
  return serializeOnboarding(business);
}

async function updateBusiness(userId, data) {
  const business = await getOrCreateBusiness(userId);
  assertOnboardingEditable(business);

  const updated = await prisma.partnerBusiness.update({
    where: { id: business.id },
    data: {
      businessName: data.businessName,
      contactName: data.contactName,
      phone: data.phone,
      location: data.location,
      description: data.description ?? null,
      onboardingStep: advanceStep(business.onboardingStep, "services"),
      ...rejectionResetData(business),
    },
    include: {
      services: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      availability: true,
      documents: { select: DOCUMENT_META_SELECT },
    },
  });

  // Keep user profile contact fields in sync
  await prisma.user.update({
    where: { id: userId },
    data: {
      name: data.contactName,
      phone: data.phone,
      address: data.location,
    },
  });

  return serializeOnboarding(updated);
}

function validateServicePricing(data) {
  if (data.priceType === "fixed") {
    if (data.price == null) throw new AppError("Price is required for fixed pricing", 400);
    return {
      price: data.price,
      minPrice: null,
      maxPrice: null,
    };
  }

  if (data.minPrice == null || data.maxPrice == null) {
    throw new AppError("minPrice and maxPrice are required for range pricing", 400);
  }
  if (data.minPrice > data.maxPrice) {
    throw new AppError("minPrice cannot be greater than maxPrice", 400);
  }

  return {
    price: null,
    minPrice: data.minPrice,
    maxPrice: data.maxPrice,
  };
}

async function listSerializedServices(userId) {
  const business = await getOrCreateBusiness(userId);
  return business.services.map(serializeService);
}

async function createService(userId, data, { live = false } = {}) {
  const business = await getOrCreateBusiness(userId);
  if (live) assertNotUnderReview(business);
  else assertOnboardingEditable(business);

  const pricing = validateServicePricing(data);
  const count = await prisma.partnerService.count({ where: { businessId: business.id } });

  await prisma.partnerService.create({
    data: {
      businessId: business.id,
      serviceType: data.serviceType,
      name: data.name,
      description: data.description ?? null,
      inclusions: data.inclusions || [],
      durationMinutes: data.durationMinutes ?? 60,
      priceType: data.priceType,
      ...pricing,
      serviceLocation: data.serviceLocation || "at_my_place",
      sortOrder: count,
    },
  });

  if (live) return { services: await listSerializedServices(userId) };

  const updated = await prisma.partnerBusiness.update({
    where: { id: business.id },
    data: {
      onboardingStep: advanceStep(business.onboardingStep, "availability"),
      ...rejectionResetData(business),
    },
    include: {
      services: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      availability: true,
      documents: { select: DOCUMENT_META_SELECT },
    },
  });

  return serializeOnboarding(updated);
}

async function updateService(userId, serviceId, data, { live = false } = {}) {
  const business = await getOrCreateBusiness(userId);
  if (live) assertNotUnderReview(business);
  else assertOnboardingEditable(business);

  const service = await prisma.partnerService.findFirst({
    where: { id: serviceId, businessId: business.id },
  });
  if (!service) throw new AppError("Service not found", 404);

  const pricing = validateServicePricing({
    priceType: data.priceType ?? service.priceType,
    price: data.price !== undefined ? data.price : (service.price != null ? Number(service.price) : null),
    minPrice: data.minPrice !== undefined ? data.minPrice : (service.minPrice != null ? Number(service.minPrice) : null),
    maxPrice: data.maxPrice !== undefined ? data.maxPrice : (service.maxPrice != null ? Number(service.maxPrice) : null),
  });

  const ops = [
    prisma.partnerService.update({
      where: { id: serviceId },
      data: {
        ...(data.serviceType !== undefined && { serviceType: data.serviceType }),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.inclusions !== undefined && { inclusions: data.inclusions }),
        ...(data.durationMinutes !== undefined && { durationMinutes: data.durationMinutes }),
        ...(data.priceType !== undefined && { priceType: data.priceType }),
        ...(data.serviceLocation !== undefined && { serviceLocation: data.serviceLocation }),
        ...pricing,
      },
    }),
  ];

  const reset = rejectionResetData(business);
  if (Object.keys(reset).length) {
    ops.push(prisma.partnerBusiness.update({ where: { id: business.id }, data: reset }));
  }

  await prisma.$transaction(ops);
  if (live) return { services: await listSerializedServices(userId) };
  return getOnboarding(userId);
}

async function deleteService(userId, serviceId, { live = false } = {}) {
  const business = await getOrCreateBusiness(userId);
  if (live) assertNotUnderReview(business);
  else assertOnboardingEditable(business);

  const service = await prisma.partnerService.findFirst({
    where: { id: serviceId, businessId: business.id },
  });
  if (!service) throw new AppError("Service not found", 404);

  const ops = [prisma.partnerService.delete({ where: { id: serviceId } })];
  const reset = rejectionResetData(business);
  if (Object.keys(reset).length) {
    ops.push(prisma.partnerBusiness.update({ where: { id: business.id }, data: reset }));
  }

  await prisma.$transaction(ops);
  if (live) return { services: await listSerializedServices(userId) };
  return getOnboarding(userId);
}

async function updateAvailability(userId, data) {
  const business = await getOrCreateBusiness(userId);
  assertOnboardingEditable(business);
  return saveAvailability(userId, business, data, { advanceOnboarding: true });
}

async function manageAvailability(userId, data) {
  const business = await getOrCreateBusiness(userId);
  assertNotUnderReview(business);
  return saveAvailability(userId, business, data, { advanceOnboarding: false });
}

async function saveAvailability(userId, business, data, { advanceOnboarding }) {
  const workingDays = data.workingDays;
  for (const day of workingDays) {
    if (!DAYS.includes(day)) throw new AppError(`Invalid day: ${day}`, 400);
  }

  await prisma.$transaction(async (tx) => {
    await tx.partnerAvailability.deleteMany({ where: { businessId: business.id } });

    if (workingDays.length) {
      await tx.partnerAvailability.createMany({
        data: workingDays.map((dayOfWeek) => ({
          businessId: business.id,
          dayOfWeek,
          startTime: data.startTime,
          endTime: data.endTime,
          isAvailable: true,
        })),
      });
    }

    await tx.partnerBusiness.update({
      where: { id: business.id },
      data: {
        sameDayRequests: data.sameDayRequests ?? false,
        ...(advanceOnboarding && {
          onboardingStep: advanceStep(business.onboardingStep, "documents"),
          ...rejectionResetData(business),
        }),
      },
    });
  });

  if (advanceOnboarding) return getOnboarding(userId);

  const updated = await getOrCreateBusiness(userId);
  const availabilitySlots = sortAvailability(updated.availability || []);
  return {
    availability: formatAvailabilitySummary(availabilitySlots, updated.sameDayRequests),
    availabilitySlots,
    sameDayRequests: updated.sameDayRequests,
  };
}

async function getAvailability(userId) {
  const business = await getOrCreateBusiness(userId);
  const availabilitySlots = sortAvailability(business.availability || []);
  return {
    availability: formatAvailabilitySummary(availabilitySlots, business.sameDayRequests),
    availabilitySlots,
    sameDayRequests: business.sameDayRequests,
  };
}

async function uploadDocument(userId, file, documentType = "business_license") {
  const business = await getOrCreateBusiness(userId);
  assertOnboardingEditable(business);

  if (!file) throw new AppError("No document file provided. Send field name: document", 400);

  const fileData = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

  await prisma.partnerDocument.create({
    data: {
      businessId: business.id,
      documentType,
      fileName: file.originalname || "document",
      mimeType: file.mimetype,
      fileData,
    },
  });

  const updated = await prisma.partnerBusiness.update({
    where: { id: business.id },
    data: {
      onboardingStep: advanceStep(business.onboardingStep, "review"),
      ...rejectionResetData(business),
    },
    include: {
      services: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      availability: true,
      documents: { orderBy: { createdAt: "desc" }, select: DOCUMENT_META_SELECT },
    },
  });

  return serializeOnboarding(updated);
}

async function deleteDocument(userId, documentId) {
  const business = await getOrCreateBusiness(userId);
  assertOnboardingEditable(business);

  const doc = await prisma.partnerDocument.findFirst({
    where: { id: documentId, businessId: business.id },
  });
  if (!doc) throw new AppError("Document not found", 404);

  const ops = [prisma.partnerDocument.delete({ where: { id: documentId } })];
  const reset = rejectionResetData(business);
  if (Object.keys(reset).length) {
    ops.push(prisma.partnerBusiness.update({ where: { id: business.id }, data: reset }));
  }

  await prisma.$transaction(ops);
  return getOnboarding(userId);
}

async function getReview(userId) {
  const data = await getOnboarding(userId);
  const serviceTypes = [...new Set(data.services.map((s) => s.serviceType))];

  return {
    ...data,
    review: {
      businessInformation: {
        businessName: data.business.businessName,
      },
      servicesSelected: serviceTypes.map((type) => ({
        serviceType: type,
        label: type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      })),
      availability: data.availability.label,
      documents: {
        count: data.documents.length,
        label: `${data.documents.length} Document${data.documents.length === 1 ? "" : "s"} Uploaded`,
      },
    },
  };
}

async function submitOnboarding(userId) {
  const business = await getOrCreateBusiness(userId);
  assertOnboardingEditable(business);

  if (!business.businessName || !business.contactName || !business.phone || !business.location) {
    throw new AppError("Business information is incomplete", 400);
  }

  const [serviceCount, documentCount, availabilityCount] = await Promise.all([
    prisma.partnerService.count({ where: { businessId: business.id } }),
    prisma.partnerDocument.count({ where: { businessId: business.id } }),
    prisma.partnerAvailability.count({ where: { businessId: business.id, isAvailable: true } }),
  ]);

  if (!serviceCount) throw new AppError("Add at least one service before submitting", 400);
  if (!availabilityCount) throw new AppError("Set your availability before submitting", 400);
  if (!documentCount) throw new AppError("Upload at least one verification document before submitting", 400);

  const updated = await prisma.partnerBusiness.update({
    where: { id: business.id },
    data: {
      onboardingStep: "submitted",
      verificationStatus: "pending",
      submittedAt: new Date(),
      rejectionReason: null,
    },
    include: {
      services: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      availability: true,
      documents: { orderBy: { createdAt: "desc" }, select: DOCUMENT_META_SELECT },
    },
  });

  return serializeOnboarding(updated);
}

async function getDashboard(userId) {
  const data = await getOnboarding(userId);

  return {
    businessName: data.business.businessName,
    verificationStatus: data.business.verificationStatus,
    onboardingStep: data.business.onboardingStep,
    progress: data.progress,
    isLive: data.isLive,
    isReady: data.isReady,
    servicesCount: data.services.length,
    documentsCount: data.documents.length,
    availability: data.availability,
    message: data.isLive
      ? "Your business is ready to go live. Start receiving requests and grow your pet care business."
      : data.business.verificationStatus === "pending"
        ? "Our team has received your application. This usually takes 24-48 hours."
        : data.business.verificationStatus === "rejected"
          ? data.business.rejectionReason || "Your application was rejected. Please update and resubmit."
          : "Complete onboarding to start receiving requests.",
  };
}

async function listPendingApplications() {
  const businesses = await prisma.partnerBusiness.findMany({
    where: { verificationStatus: "pending" },
    select: {
      ...BUSINESS_SELECT,
      user: { select: { id: true, name: true, email: true, phone: true } },
      _count: { select: { services: true, documents: true } },
    },
    orderBy: { submittedAt: "asc" },
  });

  return businesses;
}

async function reviewApplication(businessId, { status, rejectionReason }) {
  if (!["verified", "rejected"].includes(status)) {
    throw new AppError("Status must be verified or rejected", 400);
  }

  const business = await prisma.partnerBusiness.findUnique({ where: { id: businessId } });
  if (!business) throw new AppError("Business not found", 404);
  if (business.verificationStatus !== "pending") {
    throw new AppError("Only pending applications can be reviewed", 400);
  }

  const updated = await prisma.partnerBusiness.update({
    where: { id: businessId },
    data: {
      verificationStatus: status,
      verifiedAt: status === "verified" ? new Date() : null,
      rejectionReason: status === "rejected" ? (rejectionReason || "Application rejected") : null,
      // Allow re-edit after rejection
      ...(status === "rejected" && { onboardingStep: "review" }),
    },
    select: BUSINESS_SELECT,
  });

  return updated;
}

module.exports = {
  getOnboarding,
  updateBusiness,
  createService,
  updateService,
  deleteService,
  updateAvailability,
  getAvailability,
  manageAvailability,
  uploadDocument,
  deleteDocument,
  getReview,
  submitOnboarding,
  getDashboard,
  listPendingApplications,
  reviewApplication,
  SERVICE_SELECT,
};
