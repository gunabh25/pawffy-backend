const Joi = require("joi");

// ─── Reusable primitives ──────────────────────────────────────────────────────
const uuid = () => Joi.string().uuid({ version: "uuidv4" });

// ─── Auth (Supabase phone OTP on mobile → exchange session here) ───────────────
exports.sessionSchema = Joi.object({
  accessToken: Joi.string().min(20).required(),
  name:        Joi.string().min(2).max(100).optional(),
  email:       Joi.string().email().lowercase().optional(),
});

exports.vendorRegisterSchema = Joi.object({
  accessToken: Joi.string().min(20).required(),
  name:        Joi.string().min(2).max(100).required(),
  email:       Joi.string().email().lowercase().required(),
  acceptTerms: Joi.boolean().valid(true).required().messages({
    "any.only": "You must agree to the Terms & Conditions",
  }),
});

// ─── User ─────────────────────────────────────────────────────────────────────
exports.updateProfileSchema = Joi.object({
  name:         Joi.string().min(2).max(100).optional(),
  phone:        Joi.string().pattern(/^\+?[1-9]\d{6,14}$/).optional(),
  address:      Joi.string().max(255).optional(),
  city:         Joi.string().max(100).optional(),
  state:        Joi.string().max(100).optional(),
  profileImage: Joi.string().max(1048576).optional(), // 1MB base64 string
});

exports.deleteAccountSchema = Joi.object({
  confirm: Joi.string().valid("DELETE").required().messages({
    "any.only": 'Type "DELETE" to confirm account deletion',
  }),
});

exports.createAddressSchema = Joi.object({
  label:     Joi.string().max(50).optional().allow("", null),
  address:   Joi.string().min(3).max(500).required(),
  city:      Joi.string().max(100).optional().allow("", null),
  state:     Joi.string().max(100).optional().allow("", null),
  pincode:   Joi.string().max(20).optional().allow("", null),
  latitude:  Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional(),
  isDefault: Joi.boolean().optional(),
});

exports.updateAddressSchema = Joi.object({
  label:     Joi.string().max(50).optional().allow("", null),
  address:   Joi.string().min(3).max(500).optional(),
  city:      Joi.string().max(100).optional().allow("", null),
  state:     Joi.string().max(100).optional().allow("", null),
  pincode:   Joi.string().max(20).optional().allow("", null),
  latitude:  Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional(),
  isDefault: Joi.boolean().optional(),
}).min(1);

exports.walletAmountSchema = Joi.object({
  amount: Joi.number().positive().max(50000).required(),
});

// ─── Pet ──────────────────────────────────────────────────────────────────────
exports.createPetSchema = Joi.object({
  name:              Joi.string().min(1).max(100).required(),
  species:           Joi.string().min(1).max(50).required(),
  breed:             Joi.string().max(100).optional(),
  gender:            Joi.string().valid("male", "female", "unknown").optional(),
  age:               Joi.number().integer().min(0).max(100).optional(),
  weight:            Joi.number().min(0).max(999).optional(),
  color:             Joi.string().max(50).optional(),
  medicalNotes:      Joi.string().max(1000).optional(),
  vaccinationStatus: Joi.string().max(200).optional(),
  imageUrl:          Joi.string().max(1048576).optional(),
});

exports.updatePetSchema = exports.createPetSchema.fork(["name", "species"], (f) => f.optional());

// Shared service-type list used by vendor onboarding schemas below.
const SERVICE_TYPES = ["vet", "groomer", "walker", "trainer", "sitter", "boarding", "transport", "poop_scooper"];

// ─── Booking (unified) ─────────────────────────────────────────────────────────
// Time pattern inlined here (TIME_PATTERN const is declared later in this file).
const BOOKING_TIME_PATTERN = /^(0?[1-9]|1[0-2]):[0-5]\d\s?(AM|PM)$|^([01]\d|2[0-3]):[0-5]\d$/i;

exports.createBookingSchema = Joi.object({
  vendorId:    uuid().required(),
  serviceId:   uuid().required(),
  petId:       uuid().required(),
  bookingDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required().messages({
    "string.pattern.base": "bookingDate must be in YYYY-MM-DD format",
  }),
  bookingTime: Joi.string().pattern(BOOKING_TIME_PATTERN).required().messages({
    "string.pattern.base": "bookingTime must be in HH:MM or HH:MM AM/PM format",
  }),
  location:    Joi.string().max(500).optional().allow("", null),
  notes:       Joi.string().max(2000).optional().allow("", null),
});

exports.bookingsQuerySchema = Joi.object({
  status: Joi.string().valid("pending", "confirmed", "completed", "cancelled", "rejected").optional(),
});

exports.cancelBookingSchema = Joi.object({
  status: Joi.string().valid("cancelled").required(),
});

// ─── Notification ─────────────────────────────────────────────────────────────
exports.createNotificationSchema = Joi.object({
  title:   Joi.string().min(1).max(200).required(),
  message: Joi.string().min(1).max(1000).required(),
  type:    Joi.string().valid("booking", "payment", "health", "general").default("general"),
});

// ─── Message ──────────────────────────────────────────────────────────────────
exports.sendMessageSchema = Joi.object({
  receiverId: uuid().required(),
  content:    Joi.string().min(1).max(2000).required(),
});

// ─── Payment ──────────────────────────────────────────────────────────────────
exports.createPaymentIntentSchema = Joi.object({
  bookingId:     uuid().required(),
  paymentMethod: Joi.string().valid("card", "net_banking").required(),
  couponCode:    Joi.string().max(50).optional().allow(""),
});

exports.confirmPaymentSchema = Joi.object({
  bookingId:  uuid().required(),
  couponCode: Joi.string().max(50).optional().allow(""),
});

exports.applyCouponSchema = Joi.object({
  bookingId: uuid().required(),
  code:      Joi.string().min(2).max(50).uppercase().required(),
});

exports.verifyPaymentSchema = Joi.object({
  paymentIntentId: Joi.string().pattern(/^pi_/).required().messages({
    "string.pattern.base": "Invalid Stripe PaymentIntent ID",
  }),
});

// ─── Medical Record ───────────────────────────────────────────────────────────
exports.createMedicalRecordSchema = Joi.object({
  petId:        uuid().required(),
  diagnosis:    Joi.string().max(1000).allow(null, "").optional(),
  prescription: Joi.string().max(1000).allow(null, "").optional(),
  allergies:    Joi.string().max(500).allow(null, "").optional(),
  symptoms:     Joi.string().max(500).allow(null, "").optional(),
  reportUrl:    Joi.string().max(1048576).allow(null, "").optional(),
});

// ─── Vaccination ──────────────────────────────────────────────────────────────
exports.createVaccinationSchema = Joi.object({
  petId:           uuid().required(),
  vaccineName:     Joi.string().min(1).max(200).required(),
  vaccinationDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  nextDueDate:     Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes:           Joi.string().max(500).optional(),
});

exports.updateMedicalRecordSchema = exports.createMedicalRecordSchema.fork(["petId"], (f) => f.forbidden());

exports.updateVaccinationSchema = Joi.object({
  vaccineName:     Joi.string().min(1).max(200).allow(null, "").optional(),
  vaccinationDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow(null, "").optional(),
  nextDueDate:     Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow(null, "").optional(),
  notes:           Joi.string().max(500).allow(null, "").optional(),
});

// ─── Pet Reports (Lost / Found) ───────────────────────────────────────────────
const locationSchema = Joi.object({
  latitude:  Joi.number().required(),
  longitude: Joi.number().required(),
  address:   Joi.string().required(),
});

const reportImageValue = Joi.alternatives().try(
  Joi.string().pattern(/^data:image\/(jpeg|jpg|png|webp);base64,/),
  Joi.string().uri()
).messages({ "alternatives.match": "Each image must be a valid URL or uploaded image file." });

const reportImagesSchema = Joi.array()
  .items(reportImageValue)
  .min(1)
  .max(3)
  .required()
  .messages({
    "array.min": "At least 1 image is required. Upload image files (field: images) or provide image URLs.",
    "array.max": "You can upload a maximum of 3 images.",
  });

const petGenderSchema = Joi.string().valid("Male", "Female", "Unknown", "Prefer Not to Say");

// Owner flow — reporting their own missing pet
exports.createLostPetReportSchema = Joi.object({
  images:      reportImagesSchema,
  name:        Joi.string().trim().required(),
  age:         Joi.number().min(0).optional(),
  color:       Joi.string().trim().required(),
  height:      Joi.string().trim().optional(),
  weight:      Joi.string().trim().optional(),
  breed:       Joi.string().trim().required(),
  gender:      petGenderSchema.required(),
  description: Joi.string().trim().required(),
  location:    locationSchema.required(),
});

exports.updateLostPetReportSchema = exports.createLostPetReportSchema.fork(
  ["images", "name", "age", "color", "height", "weight", "breed", "gender", "description", "location"],
  (f) => f.optional()
);

// Stranger flow — saw a pet, may not know breed/name/details
exports.createFoundPetReportSchema = Joi.object({
  images:      reportImagesSchema,
  color:       Joi.string().trim().required(),
  breed:       Joi.string().trim().default("Unknown"),
  location:    locationSchema.required(),
  description: Joi.string().trim().required(),
  gender:      petGenderSchema.default("Unknown"),
});

exports.updateFoundPetReportSchema = exports.createFoundPetReportSchema.fork(
  ["images", "color", "breed", "location", "description", "gender"],
  (f) => f.optional()
);

// ─── Dashboard ────────────────────────────────────────────────────────────────
exports.dashboardSchema = Joi.object({
  latitude:  Joi.number().optional(),
  longitude: Joi.number().optional(),
  platform:  Joi.string().valid("web", "app", "Web", "App").optional(),
});

exports.partnersNearbySchema = Joi.object({
  latitude:  Joi.number().required(),
  longitude: Joi.number().required(),
});

// ─── Vendor onboarding ────────────────────────────────────────────────────────
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIME_PATTERN = /^(0?[1-9]|1[0-2]):[0-5]\d\s?(AM|PM)$|^([01]\d|2[0-3]):[0-5]\d$/i;

exports.vendorBusinessSchema = Joi.object({
  businessName: Joi.string().min(2).max(200).required(),
  contactName:  Joi.string().min(2).max(100).required(),
  phone:        Joi.string().pattern(/^\+?[1-9]\d{6,14}$/).required().messages({
    "string.pattern.base": "Invalid phone number format",
  }),
  location:     Joi.string().min(2).max(500).required(),
  description:  Joi.string().max(2000).allow("", null).optional(),
});

exports.vendorServiceSchema = Joi.object({
  serviceType:     Joi.string().valid(...SERVICE_TYPES).required(),
  name:            Joi.string().min(2).max(150).required(),
  description:     Joi.string().max(2000).allow("", null).optional(),
  inclusions:      Joi.array().items(Joi.string().min(1).max(100)).max(20).default([]),
  durationMinutes: Joi.number().integer().min(5).max(480).default(60),
  priceType:       Joi.string().valid("fixed", "range").required(),
  price:           Joi.number().min(0).max(99999).optional(),
  minPrice:        Joi.number().min(0).max(99999).optional(),
  maxPrice:        Joi.number().min(0).max(99999).optional(),
  serviceLocation: Joi.string().valid("at_my_place", "at_client_place").default("at_my_place"),
}).custom((value, helpers) => {
  if (value.priceType === "fixed" && value.price == null) {
    return helpers.message("price is required when priceType is fixed");
  }
  if (value.priceType === "range") {
    if (value.minPrice == null || value.maxPrice == null) {
      return helpers.message("minPrice and maxPrice are required when priceType is range");
    }
    if (value.minPrice > value.maxPrice) {
      return helpers.message("minPrice cannot be greater than maxPrice");
    }
  }
  return value;
});

exports.vendorServiceUpdateSchema = Joi.object({
  serviceType:     Joi.string().valid(...SERVICE_TYPES).optional(),
  name:            Joi.string().min(2).max(150).optional(),
  description:     Joi.string().max(2000).allow("", null).optional(),
  inclusions:      Joi.array().items(Joi.string().min(1).max(100)).max(20).optional(),
  durationMinutes: Joi.number().integer().min(5).max(480).optional(),
  priceType:       Joi.string().valid("fixed", "range").optional(),
  price:           Joi.number().min(0).max(99999).optional(),
  minPrice:        Joi.number().min(0).max(99999).optional(),
  maxPrice:        Joi.number().min(0).max(99999).optional(),
  serviceLocation: Joi.string().valid("at_my_place", "at_client_place").optional(),
}).min(1);

exports.vendorAvailabilitySchema = Joi.object({
  workingDays:      Joi.array().items(Joi.string().valid(...DAYS)).min(1).max(7).unique().required(),
  startTime:        Joi.string().pattern(TIME_PATTERN).required().messages({
    "string.pattern.base": "startTime must be like 09:00 AM or 09:00",
  }),
  endTime:          Joi.string().pattern(TIME_PATTERN).required().messages({
    "string.pattern.base": "endTime must be like 06:00 PM or 18:00",
  }),
  sameDayRequests:  Joi.boolean().default(false),
});

exports.vendorReviewSchema = Joi.object({
  status:          Joi.string().valid("verified", "rejected").required(),
  rejectionReason: Joi.string().max(500).when("status", {
    is: "rejected",
    then: Joi.optional(),
    otherwise: Joi.forbidden(),
  }),
});

// ─── Vendor main app screens ──────────────────────────────────────────────────
exports.vendorOnlineStatusSchema = Joi.object({
  isOnline: Joi.boolean().required(),
});

exports.vendorRequestsQuerySchema = Joi.object({
  status: Joi.string().valid("pending", "upcoming", "completed", "canceled", "cancelled").default("pending"),
  search: Joi.string().max(100).optional().allow(""),
});

exports.vendorCalendarQuerySchema = Joi.object({
  date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional().messages({
    "string.pattern.base": "date must be in YYYY-MM-DD format",
  }),
});

exports.vendorBlockedDateSchema = Joi.object({
  date:   Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required().messages({
    "string.pattern.base": "date must be in YYYY-MM-DD format",
  }),
  reason: Joi.string().max(200).optional().allow("", null),
});

exports.vendorSlotsQuerySchema = Joi.object({
  date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required().messages({
    "string.pattern.base": "date must be in YYYY-MM-DD format",
  }),
  // Optional: compute slot grid using the selected service duration.
  serviceId: uuid().optional(),
  slotDurationMinutes: Joi.number().integer().min(10).max(240).optional().default(30),
});

exports.vendorProfileQuerySchema = Joi.object({
  period: Joi.string().valid("week", "month", "year").default("month"),
});

exports.vendorProfileUpdateSchema = Joi.object({
  contactName:  Joi.string().min(2).max(100).optional(),
  businessName: Joi.string().min(2).max(200).optional(),
  location:     Joi.string().max(500).optional(),
  city:         Joi.string().max(100).optional(),
  state:        Joi.string().max(100).optional(),
  description:  Joi.string().max(2000).allow("", null).optional(),
  profileTitle: Joi.string().max(150).optional(),
  profileImage: Joi.string().max(1048576).optional(),
}).min(1);

exports.vendorEmailUpdateSchema = Joi.alternatives().try(
  Joi.object({
    newEmail: Joi.string().email().required(),
  }),
  Joi.object({
    newEmail: Joi.string().email().required(),
    otp: Joi.string().pattern(/^\d{6}$/).required(),
  })
);

exports.vendorPhoneRequestUpdateSchema = Joi.object({
  newPhone: Joi.string().pattern(/^\+?[1-9]\d{6,14}$/).required(),
});

exports.vendorPhoneVerifyUpdateSchema = Joi.object({
  newPhone: Joi.string().pattern(/^\+?[1-9]\d{6,14}$/).required(),
  otp: Joi.string().pattern(/^\d{6}$/).required(),
});

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

exports.vendorAdoptionListQuerySchema = Joi.object({
  status: Joi.string().valid(...ADOPTION_STATUSES).optional(),
  search: Joi.string().max(100).optional().allow(""),
});

exports.vendorAdoptionReviewSchema = Joi.object({
  decision: Joi.string().valid("approve_to_meet", "request_info", "reject").required(),
  notes: Joi.string().max(2000).optional().allow("", null),
  rejectionReason: Joi.string().max(500).when("decision", {
    is: "reject",
    then: Joi.string().min(1).required(),
    otherwise: Joi.optional().allow("", null),
  }),
});

exports.vendorAdoptionScheduleMeetSchema = Joi.object({
  date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required().messages({
    "string.pattern.base": "date must be in YYYY-MM-DD format",
  }),
  timeSlot: Joi.string().min(2).max(100).required(),
  meetingType: Joi.string().valid("in_person", "virtual", "phone_call").required(),
  notes: Joi.string().max(1000).optional().allow("", null),
});

exports.vendorAdoptionMeetOutcomeSchema = Joi.object({
  outcome: Joi.string().valid("approve_adoption", "decline", "not_ready_yet").required(),
  notes: Joi.string().max(2000).optional().allow("", null),
});

exports.vendorAdoptionDocumentSchema = Joi.object({
  documentType: Joi.string().valid(
    "adoption_agreement",
    "vaccination_record",
    "transfer_certificate",
    "identity_proof",
    "address_proof",
    "other"
  ).default("other"),
});

exports.vendorAdoptionCollectPaymentSchema = Joi.alternatives().try(
  Joi.object({
    paymentMethod: Joi.string().valid("card", "net_banking", "wallet").required(),
    couponCode: Joi.string().max(50).optional().allow(""),
  }),
  Joi.object({
    paymentIntentId: Joi.string().pattern(/^pi_/).required().messages({
      "string.pattern.base": "Invalid Stripe PaymentIntent ID",
    }),
  })
);

// ─── Public vendors & business reviews ───────────────────────────────────────
exports.publicVendorsQuerySchema = Joi.object({
  serviceType: Joi.string().valid(...SERVICE_TYPES).optional(),
  city: Joi.string().max(100).optional().allow(""),
  latitude: Joi.number().optional(),
  longitude: Joi.number().optional(),
  isOnline: Joi.boolean().optional(),
}).custom((value, helpers) => {
  if ((value.latitude == null) !== (value.longitude == null)) {
    return helpers.message("latitude and longitude must be provided together");
  }
  return value;
});

exports.vendorDetailQuerySchema = Joi.object({
  latitude: Joi.number().optional(),
  longitude: Joi.number().optional(),
}).custom((value, helpers) => {
  if ((value.latitude == null) !== (value.longitude == null)) {
    return helpers.message("latitude and longitude must be provided together");
  }
  return value;
});

exports.businessReviewsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(20),
});

exports.createBusinessReviewSchema = Joi.object({
  rating: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().max(1000).allow("", null).optional(),
  bookingId: uuid().required(),
});

exports.replyToBusinessReviewSchema = Joi.object({
  replyContent: Joi.string().min(1).max(1000).required(),
});

exports.createCustomerReviewSchema = Joi.object({
  bookingId: uuid().required(),
  rating: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().max(1000).allow("", null).optional(),
});

exports.customerReviewsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(20),
});

// ─── Vendor preferences & support ────────────────────────────────────────────
exports.vendorNotificationPreferencesSchema = Joi.object({
  pushRequests: Joi.boolean().required(),
  pushMessages: Joi.boolean().required(),
  emailMarketing: Joi.boolean().required(),
  smsAlerts: Joi.boolean().required(),
});

exports.supportTicketSchema = Joi.object({
  subject: Joi.string().min(3).max(200).required(),
  category: Joi.string().valid("technical_issue", "account_issue", "booking_issue", "payment_issue", "general").required(),
  description: Joi.string().min(10).max(5000).required(),
});

// ─── Vendor request lifecycle ────────────────────────────────────────────────
exports.vendorRequestStartSchema = Joi.object({});

exports.vendorRequestProgressSchema = Joi.object({
  sessionNotes: Joi.string().max(2000).optional(),
  summary: Joi.string().max(2000).optional(),
  milestones: Joi.object().pattern(Joi.string(), Joi.boolean()).optional(),
  focusAreas: Joi.object().pattern(Joi.string(), Joi.boolean()).optional(),
}).min(1);

exports.vendorRequestLocationSchema = Joi.object({
  latitude: Joi.number().required(),
  longitude: Joi.number().required(),
  address: Joi.string().max(500).optional().allow(""),
  timestamp: Joi.date().iso().optional(),
});

exports.vendorRequestCompleteSchema = Joi.object({
  clinicalNotes: Joi.string().max(3000).optional().allow("", null),
  diagnostics: Joi.string().max(1000).optional().allow("", null),
  treatments: Joi.string().max(2000).optional().allow("", null),
  summary: Joi.string().max(3000).required(),
  followUpRequired: Joi.boolean().optional(),
  followUpDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
  petMood: Joi.string().valid("happy", "normal", "bad").optional(),
  durationMinutes: Joi.number().integer().min(1).max(1440).optional(),
  assignedExercises: Joi.array().items(Joi.string().min(1).max(500)).max(20).optional(),
  mediaUrls: Joi.array().items(Joi.string().max(1048576)).max(10).optional(),
}).custom((value, helpers) => {
  if (value.followUpRequired && !value.followUpDate) {
    return helpers.message("followUpDate is required when followUpRequired is true");
  }
  return value;
});
