const db = require("../config/db");
const Joi = require("joi");
const QRCode = require("qrcode");
const midtransClient = require("midtrans-client");
const moment = require("moment-timezone");
const fs = require("fs");
require("dotenv").config();

// Midtrans API setup
const coreApi = new midtransClient.CoreApi({
  isProduction: true,
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

// Inisialisasi Snap Client
const snap = new midtransClient.Snap({
  isProduction: true, // Ganti ke `true` jika menggunakan mode production
  serverKey: process.env.MIDTRANS_SERVER_KEY,
  clientKey: process.env.MIDTRANS_CLIENT_KEY,
});

// Validation schema
const paymentSchema = Joi.object({
  bookingId: Joi.number().required(),
  paymentMethod: Joi.string().valid("qris", "tf").required(),
  bankName: Joi.string().max(50).when("paymentMethod", {
    is: "tf",
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  accountNumber: Joi.string().max(20).when("paymentMethod", {
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

// Fungsi untuk membuat Snap Token
exports.createSnapToken = async (req, res) => {
  let { bookingId, paymentMethod, bankName, accountNumber, qrisCode, phone } =
    req.body;

  try {
    // Fetch booking details
    const bookingQuery = `
      SELECT b.price AS amount, u.email AS userEmail, b.barber_id AS barberId,
             br.name AS barberName, br.no_telp AS barberPhoneNumber, 
             br.bank_name AS barberBankName, br.account_number AS barberAccountNumber
      FROM bookings b
      JOIN users u ON b.email = u.email
      JOIN barbers br ON b.barber_id = br.id
      WHERE b.id = ?
    `;
    const [booking] = await db.executeQuery(bookingQuery, [bookingId]);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Map 'bank_transfer' to 'tf' if paymentMethod is 'tf'
    if (paymentMethod === "bank_transfer") {
      paymentMethod = "tf"; // Change to 'tf'
    }

    const {
      amount,
      userEmail,
      barberName,
      barberPhoneNumber,
      barberBankName,
      barberAccountNumber,
    } = booking;

    // Prepare transaction details
    const orderId = `ORDER_${bookingId}_${Date.now()}`; // Ensure the order_id is generated here
    const transactionDetails = {
      order_id: orderId,
      gross_amount: amount,
    };

    // Prepare item details
    const itemDetails = [
      {
        id: `ITEM_${bookingId}`,
        price: amount,
        quantity: 1,
        name: `Booking #${bookingId}`,
      },
    ];

    // Prepare customer details
    const customerDetails = {
      first_name: barberName,
      email: userEmail,
      phone: phone || "08123456789", // Use provided phone or fallback
    };

    // Create Snap request payload
    const snapRequest = {
      transaction_details: transactionDetails,
      item_details: itemDetails,
      customer_details: customerDetails,
    };

    // Handle payment method
    if (paymentMethod === "tf") {
      snapRequest.payment_type = "bank_transfer";
      snapRequest.bank_transfer = { bank: bankName };
    } else if (paymentMethod === "qris") {
      snapRequest.payment_type = "qris";
    }

    // Create Snap transaction
    const snapResponse = await snap.createTransaction(snapRequest);

    // Generate a unique payment ID
    const paymentId = `PAYMENT_${bookingId}_${Date.now()}`;

    // Save payment details to database
    const savePaymentQuery = `
  INSERT INTO payments 
  (id, booking_id, amount, payment_method, bank_name, account_number, qris_code, status, order_id, barber_name, barber_phone_number, user_email, midtrans_token, midtrans_url, created_at, updated_at)

  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?, NOW(), NOW())
`;

    await db.executeQuery(savePaymentQuery, [
      paymentId, // Payment ID
      bookingId, // Booking ID
      amount, // Amount
      paymentMethod, // Payment Method (qris or tf)
      bankName || barberBankName, // Bank Name
      accountNumber || barberAccountNumber, // Account Number
      paymentMethod === "qris" ? qrisCode : null, // QRIS Code (only for QRIS payments)
      "pending", // Payment Status
      orderId, // Order ID
      barberName, // Barber Name
      barberPhoneNumber, // Barber Phone Number
      userEmail, // User Email
      snapResponse.token, // Midtrans Token
      snapResponse.redirect_url, // Midtrans URL
    ]);

    // Respond with Snap token and redirect URL
    res.status(201).json({
      message: "Snap token created and payment data saved successfully",
      snapToken: snapResponse.token,
      redirectUrl: snapResponse.redirect_url,
      booking: {
        userEmail,
        barberName,
        barberPhoneNumber,
        barberBankName,
        barberAccountNumber,
        amount,
      },
    });
  } catch (err) {
    console.error("Error in createSnapToken:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// order midtrans id
exports.getPaymentStatusOrder = async (req, res) => {
  try {
    const { id } = req.params;
    console.log("Fetching payment for orderId:", id);

    // Query to fetch the payment details, including created_at and updated_at
    const paymentQuery = `
      SELECT 
        payments.*, 
        barbers.name AS barberName, 
        users.email AS user_email,
        bookings.appointment_time,
        payments.created_at,   
        payments.updated_at    
      FROM payments
      LEFT JOIN barbers ON payments.barber_id = barbers.id
      INNER JOIN users ON payments.user_email = users.email
      LEFT JOIN bookings ON payments.booking_id = bookings.id
      WHERE payments.order_id = ?
    `;

    const [payments] = await db.executeQuery(paymentQuery, [id]);

    // Log the query result
    console.log("Query result:", payments);

    // Handle case where no payment is found
    if (!payments || Object.keys(payments).length === 0) {
      console.log("No payment found for orderId:", id);
      return res.status(404).json({ message: "Payment not found" });
    }

    // Format the appointment time
    if (payments.appointment_time) {
      payments.appointment_time = moment
        .utc(payments.appointment_time) // Convert to UTC
        .tz("Asia/Jakarta") // Change to the Jakarta time zone
        .format("dddd, D MMMM YYYY [pukul] HH.mm.ss A");
    }

    // Format the created_at and updated_at fields
    if (payments.created_at) {
      payments.created_at = moment
        .utc(payments.created_at) // Convert to UTC
        .tz("Asia/Jakarta") // Change to the Jakarta time zone
        .format("D MMMM YYYY HH:mm:ss");
    }
    if (payments.updated_at) {
      payments.updated_at = moment
        .utc(payments.updated_at) // Convert to UTC
        .tz("Asia/Jakarta") // Change to the Jakarta time zone
        .format("D MMMM YYYY HH:mm:ss");
    }

    // Log the formatted payment data
    console.log("Payment data:", payments);

    // Proceed if valid payment data is found
    if (payments && payments.midtrans_token) {
      return res.status(200).json({
        status_code: "200",
        status_message: "Success, payment found",
        payment_identifier: payments.midtrans_token,
        order_id: payments.order_id,
        gross_amount: payments.amount,
        status: payments.status,
        bank_name: payments.bank_name,
        account_number: payments.account_number,
        midtrans_url: payments.midtrans_url,
        barber_name: payments.barber_name,
        user_email: payments.user_email,
        appointment_time: payments.appointment_time,
        created_at: payments.created_at,
        updated_at: payments.updated_at,
      });
    } else {
      console.log("Payment data is incomplete or invalid:", payments);
      return res.status(400).json({ message: "Invalid payment data format" });
    }
  } catch (err) {
    console.error("Error occurred:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

// Controller to get payment status
exports.PaymentStatusSnap = async (req, res) => {
  try {
    const { transaction_id } = req.body; // The transaction ID sent from the frontend

    if (!transaction_id) {
      return res
        .status(400)
        .json({ success: false, message: "Transaction ID is required." });
    }

    // Use Snap to check payment status
    snap.transaction
      .status(transaction_id)
      .then((paymentReceipt) => {
        if (paymentReceipt.transaction_status === "settlement") {
          // If the payment is successful
          return res.status(200).json({ success: true, paymentReceipt });
        } else {
          // If the payment is not successful
          return res.status(400).json({
            success: false,
            message: "Payment not successful",
            paymentReceipt,
          });
        }
      })
      .catch((error) => {
        console.error("Error fetching payment status:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to fetch payment status",
          error: error.message,
        });
      });
  } catch (error) {
    console.error("Error processing payment status:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred",
      error: error.message,
    });
  }
};

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
      phone: req.body.phone || "08123456789", // Use provided or fallback phone
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
    console.error("Error in processPayment:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Get payment status by ID
exports.getPaymentStatus = async (req, res) => {
  const { orderId } = req.params; // Changed id to orderId

  try {
    const query = `
      SELECT 
        p.*, 
        u.email AS userEmail, 
        b.barber_id AS barberId, 
        b.paket, 
        b.appointment_time, 
        b.service, 
        b.latitude, 
        b.longitude
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      JOIN users u ON b.email = u.email
      WHERE p.id = ?
    `;
    const [payment] = await db.executeQuery(query, [orderId]); // Pass orderId instead of id

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    res.status(200).json({ payment });
  } catch (err) {
    console.error("Error in getPaymentStatus:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Get payment by ID (using order_id instead of id)
exports.getPaymentById = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: "Missing ID parameter" });
  }

  try {
    // Query untuk mendapatkan data pembayaran dan informasi terkait
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
        COALESCE(bar.name, 'No Barber Assigned') AS barberName,  
        COALESCE(bar.no_telp, 'No Phone Assigned') AS barberPhoneNumber,
        u.email AS userEmail,
        p.created_at AS createdAt,
        b.price AS bookingPrice,
        p.order_id AS orderId,
        b.latitude AS barberLatitude, 
        b.longitude AS barberLongitude,
        b.appointment_time AS appointmentTime
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      LEFT JOIN barbers bar ON p.barber_id = bar.id 
      LEFT JOIN users u ON b.email = u.email  
      WHERE p.order_id = ?
    `;

    // Menjalankan query untuk mengambil data pembayaran
    const [payment] = await db.executeQuery(query, [id]);

    console.log("Payment data received:", payment); // Log untuk memastikan data pembayaran

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    // Format appointment_time agar sesuai dengan zona waktu Asia/Jakarta
    if (payment.appointmentTime) {
      payment.appointmentTime = moment
        .utc(payment.appointmentTime) // Convert ke UTC
        .tz("Asia/Jakarta") // Ubah ke zona waktu Jakarta
        .format("dddd, D MMMM YYYY [pukul] HH.mm.ss A"); // Format yang lebih rapi
    }

    // Jika barber_id kosong, cari barber berdasarkan bookingId atau koordinat
    if (!payment.barberId && payment.bookingId) {
      console.log("No barber assigned, searching for a barber for booking...");

      // Cek apakah booking terkait memiliki barberId, jika tidak cari berdasarkan latitude dan longitude
      const bookingQuery = `
        SELECT bar.id, bar.name, bar.no_telp
        FROM bookings b
        LEFT JOIN barbers bar ON b.barber_id = bar.id
        WHERE b.id = ?;
      `;
      const [bookingBarber] = await db.executeQuery(bookingQuery, [
        payment.bookingId,
      ]);

      if (bookingBarber) {
        console.log("Barber found for booking:", bookingBarber); // Log jika barber ditemukan
        payment.barberId = bookingBarber.id;
        payment.barberName = bookingBarber.name;
        payment.barberPhoneNumber = bookingBarber.no_telp;
      } else {
        console.log(
          "No barber found for the booking, searching by coordinates..."
        );

        // Cari barber berdasarkan lokasi (latitude dan longitude)
        const barberQuery = `
          SELECT id, name, no_telp
          FROM barbers 
          WHERE latitude = ? AND longitude = ? LIMIT 1;
        `;
        const [barber] = await db.executeQuery(barberQuery, [
          payment.barberLatitude,
          payment.barberLongitude,
        ]);

        if (barber) {
          console.log("Barber found by coordinates:", barber); // Log jika barber ditemukan
          payment.barberId = barber.id;
          payment.barberName = barber.name;
          payment.barberPhoneNumber = barber.no_telp;
        } else {
          console.log(
            "No barber found by coordinates, using default barber..."
          );
          payment.barberName = "No Barber Assigned";
          payment.barberPhoneNumber = "No Phone Assigned";
        }
      }
    }

    // Response JSON dengan appointment_time yang telah diformat
    return res.status(200).json({
      status_code: "200",
      status_message: "Success, payment found",
      payment_identifier: payment.paymentId,
      order_id: payment.orderId,
      gross_amount: payment.amount,
      status: payment.status,
      bank_name: payment.bankName,
      account_number: payment.accountNumber,
      barber_name: payment.barberName,
      barber_phone_number: payment.barberPhoneNumber,
      user_email: payment.userEmail,
      appointment_time: payment.appointmentTime, // Menggunakan appointment_time yang sudah diformat
      created_at: payment.createdAt,
    });

    // Mengembalikan hasil pembayaran dengan data lengkap
    res.status(200).json({ payment });
  } catch (err) {
    console.error("Error in getPaymentById:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.getAllPayments = async (req, res) => {
  try {
    const query = `
  SELECT 
    p.*, 
    u.email AS userEmail, 
    b.barber_id AS barberId, 
    b.paket, 
    b.appointment_time,
    b.service,
    bar.name AS barberName,  
    bar.no_telp AS barberPhoneNumber,
    IFNULL(CONCAT('http://localhost:5001', pup.proof_file), '') AS proofFile  
  FROM 
    payments p
  JOIN 
    bookings b ON p.booking_id = b.id
  JOIN 
    users u ON b.email = u.email
  LEFT JOIN 
    payment_uploadProof pup ON p.id = pup.payment_id   
  LEFT JOIN 
    barbers bar ON b.barber_id = bar.id  -- Corrected the column name
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

// get barber id of payments
exports.getPaymentsByBarberId = async (req, res) => {
  try {
    const { barberId } = req.params; // Ambil barberId dari parameter URL

    const query = `
      SELECT 
        p.*, 
        u.email AS userEmail, 
        b.barber_id AS barberId, 
        b.paket, 
        b.appointment_time,
        b.service,
        bar.name AS barberName,  
        bar.no_telp AS barberPhoneNumber,
        IFNULL(CONCAT('http://localhost:5001', pup.proof_file), '') AS proofFile  
      FROM 
        payments p
      JOIN 
        bookings b ON p.booking_id = b.id
      JOIN 
        users u ON b.email = u.email
      LEFT JOIN 
        payment_uploadProof pup ON p.id = pup.payment_id   
      LEFT JOIN 
        barbers bar ON b.barber_id = bar.id  
      WHERE 
        b.barber_id = ?  -- Filter berdasarkan barber_id
      ORDER BY 
        p.created_at DESC
    `;

    const payments = await db.executeQuery(query, [barberId]);

    if (payments.length === 0) {
      return res
        .status(404)
        .json({ message: "Tidak ada pembayaran untuk barber ini" });
    }

    res.status(200).json({ payments });
  } catch (err) {
    console.error("Error in getPaymentsByBarberId:", err);
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

// Handle file upload and payment processing
exports.uploadProofAndSave = async (req, res) => {
  const { file } = req;

  if (!file) {
    return res
      .status(400)
      .json({ message: "No proof of payment file uploaded." });
  }

  try {
    // Simulate extracting payment_id from request body or session
    // In this case, assume payment_id is sent in the body (you could adjust based on your needs)
    const { payment_id } = req.body; // Or get it from session, if needed

    if (!payment_id) {
      return res.status(400).json({ message: "Payment ID is required." });
    }

    // Save proof file path to the database (payment_uploadProof table)
    const filePath = `/uploads/proofs/${file.filename}`;
    const insertQuery = `
      INSERT INTO payment_uploadProof (payment_id, proof_file)
      VALUES (?, ?)
    `;

    const result = await db.executeQuery(insertQuery, [payment_id, filePath]);

    if (result.affectedRows === 0) {
      return res
        .status(500)
        .json({ message: "Failed to save proof data to the database." });
    }

    // Return success response
    res.status(200).json({
      message: "Proof uploaded successfully.",
      proofPath: filePath,
    });
  } catch (err) {
    console.error("Error in uploadProofAndSave:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
