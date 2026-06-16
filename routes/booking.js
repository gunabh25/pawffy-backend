const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { requireRole } = require("../middleware/rbac");
const validate = require("../middleware/validate");
const v = require("../models/validators");
const { createBooking, getMyBookings, getBookingById, updateBookingStatus, getAllBookings } = require("../controllers/bookingController");

router.post  ("/",           verifyToken, validate(v.createBookingSchema),       createBooking);
router.get   ("/",           verifyToken,                                         getMyBookings);
router.get   ("/all",        verifyToken, requireRole("admin"),                   getAllBookings);
router.get   ("/:id",        verifyToken,                                         getBookingById);
router.patch ("/:id/status", verifyToken, validate(v.updateBookingStatusSchema),  updateBookingStatus);

module.exports = router;
