const db = require("../config/db");
const Joi = require("joi");
const QRCode = require("qrcode");
const midtransClient = require("midtrans-client");
require("dotenv").config();

// Midtrans API setup
const coreApi = new midtransClient.CoreApi({
  isProduction: false,
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

// Validation schema
const paymentSchema = Joi.object({
  bookingId: Joi.number().required(),
  paymentMethod: Joi.string().valid("qris", "tf").required(),
  bankName: Joi.string().when("paymentMethod", {
    is: "tf",
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  accountNumber: Joi.string().when("paymentMethod", {
    is: "tf",
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  qrisCode: Joi.string().when("paymentMethod", {
    is: "qris",
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  amount: Joi.number().positive().optional(),
});

// Process payment
exports.processPayment = async (req, res) => {
  const { error } = paymentSchema.validate(req.body);
  if (error) {
    return res
      .status(400)
      .json({ message: "Validation error", errors: error.details });
  }

  const { bookingId, paymentMethod, bankName, accountNumber, qrisCode } =
    req.body;

  try {
    // Retrieve booking details
    const bookingQuery = `
      SELECT 
        b.price AS amount, 
        u.email AS userEmail, 
        b.barber_id AS barberId, 
        br.name AS barberName, 
        br.bank_name AS barberBankName, 
        br.account_number AS barberAccountNumber
      FROM bookings b
      JOIN users u ON b.email = u.email
      JOIN barbers br ON b.barber_id = br.id
      WHERE b.id = ?
    `;
    const [booking] = await db.executeQuery(bookingQuery, [bookingId]);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const {
      amount,
      userEmail,
      barberId,
      barberName,
      barberBankName,
      barberAccountNumber,
    } = booking;

    // Insert payment into database
    const paymentQuery = `
      INSERT INTO payments 
      (booking_id, payment_method, amount, bank_name, account_number, qris_code, barber_id, barber_name, user_email, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const result = await db.executeQuery(paymentQuery, [
      bookingId,
      paymentMethod,
      amount,
      paymentMethod === "tf" ? bankName : barberBankName,
      paymentMethod === "tf" ? accountNumber : barberAccountNumber,
      qrisCode || null,
      barberId,
      barberName,
      userEmail,
      "pending",
    ]);

    if (!result.insertId) {
      return res.status(500).json({ message: "Failed to process payment" });
    }

    // Generate QR code if payment method is QRIS
    let qrCodeImage = null;
    if (paymentMethod === "qris") {
      qrCodeImage = await QRCode.toDataURL(qrisCode, {
        errorCorrectionLevel: "H",
      });
    }

    // Midtrans API integration
    const transactionDetails = {
      order_id: `ORDER_${result.insertId}`,
      gross_amount: amount,
    };

    const itemDetails = [
      {
        id: `ITEM_${bookingId}`,
        price: amount,
        quantity: 1,
        name: `Booking #${bookingId}`,
      },
    ];

    const customerDetails = {
      first_name: barberName,
      email: userEmail,
      phone: "08123456789", // You can replace this with the actual user's phone number
    };

    const chargeRequest = {
      payment_type: paymentMethod === "qris" ? "qris" : "bank_transfer",
      transaction_details: transactionDetails,
      item_details: itemDetails,
      customer_details: customerDetails,
      bank_transfer: paymentMethod === "tf" ? { bank: bankName } : null,
    };

    const chargeResponse = await coreApi.charge(chargeRequest);

    // Update payment with Midtrans details
    const updatePaymentQuery = `
      UPDATE payments 
      SET midtrans_token = ?, midtrans_url = ? 
      WHERE id = ?
    `;
    await db.executeQuery(updatePaymentQuery, [
      chargeResponse.token,
      chargeResponse.redirect_url,
      result.insertId,
    ]);

    res.status(201).json({
      message: "Payment initiated successfully",
      paymentId: result.insertId,
      bookingId,
      userEmail,
      barberId,
      barberName,
      qrCodeImage,
      redirectUrl: chargeResponse.redirect_url,
      token: chargeResponse.token,
    });
  } catch (err) {
    console.error("Error in processPayment:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Get payment status by ID
exports.getPaymentStatus = async (req, res) => {
  const { id } = req.params;

  try {
    const query = `
      SELECT p.*, u.email AS userEmail, b.barber_id AS barberId, b.paket, b.appointment_time, service, b.latitude, b.longitude
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      JOIN users u ON b.email = u.email
      WHERE p.id = ?
    `;
    const [payment] = await db.executeQuery(query, [id]);

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    res.status(200).json({ payment });
  } catch (err) {
    console.error("Error in getPaymentStatus:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Get payment by ID
exports.getPaymentById = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: "Missing ID parameter" });
  }

  try {
    const query = `
      SELECT 
        p.id AS paymentId,
        p.booking_id AS bookingId,
        p.payment_method AS paymentMethod,
        p.amount,
        p.bank_name AS bankName,
        p.account_number AS accountNumber,
        p.qris_code AS qrisCode,
        p.status,
        p.barber_id AS barberId,
        p.barber_name AS barberName,
        p.user_email AS userEmail,
        p.created_at AS createdAt,
        b.price AS bookingPrice
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      WHERE p.id = ?
    `;
    const [payment] = await db.executeQuery(query, [id]);

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    res.status(200).json({ payment });
  } catch (err) {
    console.error("Error in getPaymentById:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Fetch all payments
exports.getAllPayments = async (req, res) => {
  try {
    const query = `
      SELECT 
        p.*, 
        u.email AS userEmail, 
        b.barber_id AS barberId, 
        b.paket, 
        b.appointment_time
      FROM 
        payments p
      JOIN 
        bookings b ON p.booking_id = b.id
      JOIN 
        users u ON b.email = u.email
      ORDER BY 
        p.created_at DESC
    `;
    const payments = await db.executeQuery(query);

    res.status(200).json({ payments });
  } catch (err) {
    console.error("Error in getAllPayments:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Update payment status
exports.updatePaymentStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ message: "Missing status field" });
  }

  try {
    const query = `
      UPDATE payments 
      SET status = ? 
      WHERE id = ?
    `;
    const result = await db.executeQuery(query, [status, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Payment not found" });
    }

    res.status(200).json({ message: "Payment status updated" });
  } catch (err) {
    console.error("Error in updatePaymentStatus:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Delete payment
exports.deletePayment = async (req, res) => {
  const { id } = req.params;

  try {
    const query = `
      DELETE FROM payments 
      WHERE id = ?
    `;
    const result = await db.executeQuery(query, [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Payment not found" });
    }

    res.status(200).json({ message: "Payment deleted" });
  } catch (err) {
    console.error("Error in deletePayment:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
