const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { createBooking, getMyBookings, getBookingById, updateBookingStatus, getAllBookings } = require("../controllers/bookingController");

router.post("/", verifyToken, createBooking);
router.get("/", verifyToken, getMyBookings);
router.get("/all", verifyToken, getAllBookings);
router.get("/:id", verifyToken, getBookingById);
router.patch("/:id/status", verifyToken, updateBookingStatus);

module.exports = router;
