const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentsController");
const multer = require("multer");
const fs = require("fs");

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "./uploads/proofs";
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/jpg",
    "application/pdf",
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only JPG, PNG, and PDF are allowed."));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
}).single("proof"); // 'proof' is the field name for file upload in the form

// Route for uploading proof and saving it to the payment_uploadProof table
router.post(
  "/upload-proof",
  upload, // multer middleware for file upload
  paymentController.uploadProofAndSave // The controller function that handles the upload and saving to the payment_uploadProof table
);

//snap transcation
router.post("/snap", paymentController.createSnapToken);

// Post payment by ID
router.post("/pay", paymentController.processPayment);

router.post("/payment-status-snap", paymentController.PaymentStatusSnap);

// Get payment by ID
router.get("/:id", paymentController.getPaymentById);

router.get("/:id/status-order", paymentController.getPaymentStatusOrder);

// Get payment status
router.get("/:id/status", paymentController.getPaymentStatus);

//get id barber from payments

router.get("/barber/:barberId", paymentController.getPaymentsByBarberId);

// Get all payments
router.get("/", paymentController.getAllPayments);

// Update payment status
router.put("/:id", paymentController.updatePaymentStatus);

// Delete payment
router.delete("/:id", paymentController.deletePayment);

module.exports = router;
