const Joi = require("joi");

// ─── Reusable primitives ──────────────────────────────────────────────────────
const uuid = () => Joi.string().uuid({ version: "uuidv4" });
const pw   = () => Joi.string().min(8).max(72).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "strong").messages({
  "string.pattern.name": "Password must contain at least one uppercase letter, one lowercase letter, and one number",
  "string.min": "Password must be at least 8 characters",
});

// ─── Auth ─────────────────────────────────────────────────────────────────────
exports.registerSchema = Joi.object({
  name:  Joi.string().min(2).max(100).optional(),
  email: Joi.string().email().lowercase().optional(),
  phoneNumber: Joi.string().pattern(/^\+?[1-9]\d{6,14}$/).optional().messages({
    "string.pattern.base": "Invalid phone number format",
  }),
  password: pw().required(),
}).or("email", "phoneNumber");

exports.loginSchema = Joi.object({
  email:       Joi.string().email().lowercase().optional(),
  phoneNumber: Joi.string().optional(),
  password:    Joi.string().required(),
}).or("email", "phoneNumber");

exports.forgotPasswordSchema = Joi.object({
  email: Joi.string().email().lowercase().required(),
});

exports.resetPasswordSchema = Joi.object({
  token:       Joi.string().min(32).required(),
  newPassword: pw().required(),
});

exports.changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword:     pw().required(),
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

// ─── Vet ──────────────────────────────────────────────────────────────────────
const SERVICE_TYPES = ["vet", "groomer", "walker", "trainer", "sitter", "boarding", "transport", "poop_scooper"];

exports.createVetSchema = Joi.object({
  name:            Joi.string().min(2).max(100).required(),
  email:           Joi.string().email().lowercase().required(),
  serviceType:     Joi.string().valid(...SERVICE_TYPES).default("vet"),
  specialization:  Joi.string().max(200).optional(),
  experienceYears: Joi.number().integer().min(0).max(60).optional(),
  clinicName:      Joi.string().max(200).optional(),
  clinicAddress:   Joi.string().max(500).optional(),
  clinicCity:      Joi.string().max(100).optional(),
  phone:           Joi.string().pattern(/^\+?[1-9]\d{6,14}$/).optional(),
  consultationFee: Joi.number().min(0).optional(),
  city:            Joi.string().max(100).optional(),
  state:           Joi.string().max(100).optional(),
});

exports.updateVetSchema = exports.createVetSchema.fork(["name", "email"], (f) => f.optional()).append({
  availableStatus: Joi.boolean().optional(),
  rating:          Joi.number().min(0).max(5).optional(),
  profileImage:    Joi.string().max(1048576).optional(),
});

// ─── Vet Service ──────────────────────────────────────────────────────────────
exports.createVetServiceSchema = Joi.object({
  name:        Joi.string().min(2).max(150).required(),
  description: Joi.string().max(500).optional(),
  price:       Joi.number().min(0).max(99999).required(),
  duration:    Joi.number().integer().min(5).max(480).default(30),
});

// ─── Booking ──────────────────────────────────────────────────────────────────
const BOOKING_TYPES = ["veterinarian", "grooming", "walking", "training", "boarding", "sitting", "sitter", "poop_scooper", "transport"];

exports.createBookingSchema = Joi.object({
  petId:            uuid().required(),
  vetId:            uuid().optional(),
  serviceId:        uuid().optional(),
  bookingType:      Joi.string().valid(...BOOKING_TYPES).required(),
  bookingDate:      Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required().messages({
    "string.pattern.base": "bookingDate must be in YYYY-MM-DD format",
  }),
  bookingTime:      Joi.string().pattern(/^\d{2}:\d{2}$/).required().messages({
    "string.pattern.base": "bookingTime must be in HH:MM format",
  }),
  reasonForVisit:   Joi.string().max(500).optional(),
  symptoms:         Joi.string().max(500).optional(),
  symptomsDuration: Joi.string().valid("Today", "2 Days ago", "A week ago", "More than a week").optional(),
  notes:            Joi.string().max(500).optional(),
});

exports.updateBookingStatusSchema = Joi.object({
  status: Joi.string().valid("pending", "confirmed", "completed", "cancelled").required(),
});

// ─── Review ───────────────────────────────────────────────────────────────────
exports.createReviewSchema = Joi.object({
  rating:    Joi.number().integer().min(1).max(5).required(),
  comment:   Joi.string().max(1000).optional(),
  bookingId: uuid().optional(),
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
  vetId:           uuid().optional(),
  notes:           Joi.string().max(500).optional(),
});

// ─── Pet Reports (Lost / Found) ───────────────────────────────────────────────
const locationSchema = Joi.object({
  latitude:  Joi.number().required(),
  longitude: Joi.number().required(),
  address:   Joi.string().required(),
});

const reportImagesSchema = Joi.array()
  .items(Joi.string().uri())
  .min(1)
  .max(3)
  .required()
  .messages({
    "array.min": "At least 1 image is required.",
    "array.max": "You can upload a maximum of 3 images.",
  });

exports.createLostPetReportSchema = Joi.object({
  images:      reportImagesSchema,
  name:        Joi.string().trim().required(),
  age:         Joi.number().min(0).required(),
  color:       Joi.string().trim().required(),
  height:      Joi.string().trim().required(),
  weight:      Joi.string().trim().required(),
  breed:       Joi.string().trim().required(),
  gender:      Joi.string().valid("Male", "Female", "Prefer Not to Say").required(),
  description: Joi.string().trim().required(),
  location:    locationSchema.required(),
});

exports.updateLostPetReportSchema = exports.createLostPetReportSchema.fork(
  ["images", "name", "age", "color", "height", "weight", "breed", "gender", "description", "location"],
  (f) => f.optional()
);

exports.createFoundPetReportSchema = Joi.object({
  images:      reportImagesSchema,
  color:       Joi.string().trim().required(),
  breed:       Joi.string().trim().required(),
  location:    locationSchema.required(),
  description: Joi.string().trim().required(),
  gender:      Joi.string().valid("Male", "Female", "Prefer Not to Say").required(),
});

exports.updateFoundPetReportSchema = exports.createFoundPetReportSchema.fork(
  ["images", "color", "breed", "location", "description", "gender"],
  (f) => f.optional()
);

// ─── Walking Booking ──────────────────────────────────────────────────────────
const walkingSlotTimeSchema = Joi.object({
  morningSlot: Joi.string().allow(""),
  eveningSlot: Joi.string().allow(""),
});

exports.createWalkingBookingSchema = Joi.object({
  selectedAddress: Joi.object({
    fullAddress: Joi.string().required(),
    latitude:    Joi.number().optional(),
    longitude:   Joi.number().optional(),
    city:        Joi.string().optional(),
    state:       Joi.string().optional(),
    country:     Joi.string().optional(),
    postalCode:  Joi.string().optional(),
  }).optional(),

  selectedDays:    Joi.string().required(),
  selectedPetList: Joi.array().min(1).required(),
  selectedService: Joi.object({
    title:       Joi.string().required(),
    description: Joi.string().allow(""),
    price:       Joi.number().optional(),
  }).required(),
  selectedPackage: Joi.object().allow(null),
  isPackage:       Joi.boolean().required(),
  partnerId:       uuid().required(),
  walkingType:     Joi.string().valid("Once a day", "Twice a day").required(),
  slotTime:        walkingSlotTimeSchema.required(),
  walkingDuration: Joi.string().required(),
  paymentStatus:   Joi.string().valid("Pending", "Paid", "pending", "paid").optional(),
});

// ─── Dashboard ────────────────────────────────────────────────────────────────
exports.dashboardSchema = Joi.object({
  userId:    uuid().optional(),
  latitude:  Joi.number().optional(),
  longitude: Joi.number().optional(),
  platform:  Joi.string().valid("web", "app", "Web", "App").optional(),
});

exports.partnersNearbySchema = Joi.object({
  latitude:  Joi.number().required(),
  longitude: Joi.number().required(),
});
