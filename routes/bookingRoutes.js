const express = require("express");
const {
  createBooking,
  getBookings,
  updateBooking,
  deleteBooking,
  updateStatus,
  getBookingById,
} = require("../controllers/bookingController");

const router = express.Router();

// Create a new booking
router.post("/add", createBooking);

// Get all bookings, filtered by userId or barberId
router.get("/", getBookings);

// Get a specific booking by ID
router.get("/:id", getBookingById);

// Update booking details by bookingId
router.put("/:id", updateBooking);

// Delete booking by bookingId
router.delete("/:id", deleteBooking);

// Update booking status
router.put("/:id/status", updateStatus);

module.exports = router;
