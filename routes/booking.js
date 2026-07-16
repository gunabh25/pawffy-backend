const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { requireRole } = require("../middleware/rbac");
const validate = require("../middleware/validate");
const { validateUuidParams } = require("../middleware/accessControl");
const { writeLimiter } = require("../middleware/rateLimiter");
const v = require("../validators");
const {
  createBooking,
  getMyBookings,
  getBookingById,
  cancelBooking,
} = require("../controllers/bookingController");

const customerOnly = [verifyToken, requireRole("customer")];

router.post ("/", ...customerOnly, writeLimiter, validate(v.createBookingSchema), createBooking);
router.get  ("/", verifyToken, validate(v.bookingsQuerySchema, "query"), getMyBookings);
router.get  ("/:id", verifyToken, validateUuidParams("id"), getBookingById);
router.patch("/:id/status", ...customerOnly, writeLimiter, validateUuidParams("id"), validate(v.cancelBookingSchema), cancelBooking);

module.exports = router;
