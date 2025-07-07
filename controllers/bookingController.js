const Joi = require("joi");
const db = require("../config/db");
const validStatuses = ["pending", "confirmed", "completed", "cancelled"];

// Joi schema for booking validation, including price
const bookingSchema = Joi.object({
  email: Joi.string().email().required(),
  barberId: Joi.number().required(),
  appointmentTime: Joi.string().required(),
  location: Joi.string().valid("barbershop", "home").required(),
  address: Joi.string()
    .when("location", { is: "home", then: Joi.required() })
    .optional(),
  service: Joi.string().max(255).required(),
  paket: Joi.string().optional(),
  paket_description: Joi.string().optional(),
  price: Joi.number().precision(2).required(),
  bank_name: Joi.string().required(),
  account_number: Joi.string().required(),
  payment_method: Joi.string().valid("tf", "qris").required(),
});

// Get Bookings
exports.getBookings = async (req, res) => {
  const { email, barberId } = req.query;

  try {
    let query = `
      SELECT 
        bookings.*, 
        barbers.name AS barberName, 
        barbers.no_telp AS barberPhoneNumber,
        barbers.latitude AS barberLatitude, 
        barbers.longitude AS barberLongitude
      FROM bookings
      LEFT JOIN barbers ON bookings.barber_id = barbers.id
    `;
    const params = [];

    if (email) {
      query += " WHERE bookings.email = ?";
      params.push(email);
    } else if (barberId) {
      query += " WHERE bookings.barber_id = ?";
      params.push(barberId);
    }

    const bookings = await db.executeQuery(query, params);

    res.json(bookings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// Helper function to fetch and validate a booking by its ID and email
const getBookingById = async (bookingId, email) => {
  const result = await db.executeQuery(
    "SELECT * FROM bookings WHERE id = ? AND email = ?",
    [bookingId, email]
  );
  return result[0]; // Ensure you return the first row from the result
};

exports.getBookingById = async (req, res) => {
  const { id } = req.params; // Ambil id booking dari URL parameter

  try {
    // Query untuk mendapatkan booking berdasarkan id dan menambahkan nama barber serta nomor telepon
    const query = `
      SELECT b.*, 
             bb.name AS barberName, 
             bb.no_telp AS barberPhoneNumber
      FROM bookings b
      LEFT JOIN barbers bb ON b.barber_id = bb.id
      WHERE b.id = ?`;

    const result = await db.executeQuery(query, [id]);

    if (result.length === 0) {
      return res.status(404).json({ message: "Pemesanan tidak ditemukan" });
    }

    res.status(200).json({ booking: result[0] }); // Kembalikan data pemesanan
  } catch (err) {
    console.error("Error in getBookingById:", err);
    res
      .status(500)
      .json({ message: "Terjadi kesalahan server", error: err.message });
  }
};

// Create Booking
exports.createBooking = async (req, res) => {
  const { error } = bookingSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res
      .status(400)
      .json({ message: "Validation error", errors: error.details });
  }

  const {
    email,
    barberId,
    appointmentTime,
    location,
    address = null,
    service,
    paket = null,
    paket_description = null,
    price = null,
    bank_name,
    account_number,
    payment_method,
  } = req.body;

  try {
    // Fetch latitude, longitude, and other details from the barber table
    const barberQuery = `
      SELECT latitude, longitude, bank_name, account_number, payment_method
      FROM barbers
      WHERE id = ?`;
    const barberResult = await db.executeQuery(barberQuery, [barberId]);

    if (!barberResult.length) {
      return res.status(404).json({ message: "Barber not found" });
    }

    const { latitude, longitude } = barberResult[0];

    // Insert the booking into the bookings table
    const query = `
  INSERT INTO bookings 
  (email, barber_id, appointment_time, location, address, latitude, longitude, service, paket, paket_description, price, bank_name, account_number, payment_method) 
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;
    console.log({
      email,
      barberId,
      appointmentTime,
      location,
      address,
      service,
      paket,
      paket_description,
      price,
      bank_name,
      account_number,
      payment_method,
    });

    const result = await db.executeQuery(query, [
      email,
      barberId,
      appointmentTime,
      location,
      address || null, // Optional, default to null if not provided
      latitude,
      longitude,
      service,
      paket || null, // Optional, default to null if not provided
      paket_description || null, // Optional, default to null if not provided
      price,
      bank_name,
      account_number,
      payment_method,
    ]);

    if (!result || !result.insertId) {
      return res
        .status(500)
        .json({ message: "Unexpected result format from database" });
    }

    // Send a success response with booking ID
    res.status(201).json({
      message: "Booking successful!",
      bookingId: result.insertId, // Return the inserted booking ID
    });
  } catch (err) {
    console.error("Error in createBooking:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Update Booking
exports.updateBooking = async (req, res) => {
  const { id } = req.params; // Booking ID from URL parameters
  const { email, status, location, service, appointment_time } = req.body; // Other fields from request body

  // Validate required fields
  if (!email) {
    return res.status(400).json({ message: "Email is missing" });
  }

  // Validate status if provided
  if (status && !["pending", "completed", "cancelled"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  try {
    // Check if the booking exists
    const [existingBooking] = await db.executeQuery(
      "SELECT * FROM bookings WHERE id = ? AND email = ?",
      [id, email]
    );

    if (!existingBooking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Update booking details
    const updateQuery = `
      UPDATE bookings 
      SET 
        status = ?, 
        location = ?, 
        service = ?, 
        appointment_time = ? 
      WHERE id = ?
    `;

    const result = await db.executeQuery(updateQuery, [
      status || existingBooking.status,
      location || existingBooking.location,
      service || existingBooking.service,
      appointment_time || existingBooking.appointment_time,
      id,
    ]);

    if (result.affectedRows === 0) {
      return res.status(400).json({ message: "Failed to update booking" });
    }

    res.status(200).json({ message: "Booking updated successfully" });
  } catch (error) {
    console.error("Error updating booking:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// Delete Booking
exports.deleteBooking = async (req, res) => {
  const { id } = req.params; // Get booking ID from URL parameters
  const { email } = req.body; // Get email from request body

  try {
    // Check if the booking exists
    const [existingBooking] = await db.executeQuery(
      "SELECT * FROM bookings WHERE id = ?",
      [id]
    );

    if (!existingBooking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    console.log("ID:", id);
    console.log("Email:", email);

    // Delete the booking
    const result = await db.executeQuery("DELETE FROM bookings WHERE id = ?", [
      id,
    ]);

    if (result.affectedRows === 0) {
      return res.status(400).json({ message: "Failed to delete booking" });
    }

    res.status(200).json({ message: "Booking deleted successfully" });
  } catch (error) {
    console.error("Error deleting booking:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// Update Booking Status
exports.updateStatus = async (req, res) => {
  const { id } = req.params; // Use 'id' from URL parameter
  const { status } = req.body; // Extract status from request body

  // Log incoming data for debugging
  console.log("Request Params:", req.params);
  console.log("Request Body:", req.body);

  // Validations
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ message: "Invalid or missing status" });
  }
  console.log("BookingId:", id);
  console.log("Status:", status);

  try {
    // Check if booking exists with the given id
    const [existingBooking] = await db.executeQuery(
      "SELECT * FROM bookings WHERE id = ?",
      [id]
    );

    if (!existingBooking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Update booking status
    const updateResult = await db.executeQuery(
      "UPDATE bookings SET status = ? WHERE id = ?",
      [status, id]
    );

    if (updateResult.affectedRows === 0) {
      return res
        .status(400)
        .json({ message: "Failed to update status, please try again." });
    }

    res.status(200).json({ status }); // Send the updated status
  } catch (err) {
    console.error("Error in updateStatus:", err);
    res.status(500).json({ error: "Server error" });
  }
};
