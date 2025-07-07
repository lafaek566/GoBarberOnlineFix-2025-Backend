const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs"); // Add this line
const barberController = require("../controllers/barberController");

const router = express.Router();

// Directory paths
const profileDir = path.join(__dirname, "../uploads/profile");
const galleryDir = path.join(__dirname, "../uploads/gallery");

// Ensure the directories exist, create them if they don't
if (!fs.existsSync(profileDir)) {
  fs.mkdirSync(profileDir, { recursive: true });
}

if (!fs.existsSync(galleryDir)) {
  fs.mkdirSync(galleryDir, { recursive: true });
}

// Multer storage setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "profileImage") {
      cb(null, profileDir); // Save profile image to profile directory
    } else if (file.fieldname === "galleryImages") {
      cb(null, galleryDir); // Save gallery images to gallery directory
    } else {
      cb(new Error("Invalid file field"));
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png/;
    const extname = fileTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = fileTypes.test(file.mimetype);

    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error("Only images are allowed (JPEG, PNG)."));
    }
  },
}).fields([
  { name: "profileImage", maxCount: 1 },
  { name: "galleryImages", maxCount: 5 },
]);

// Route for adding a barber
router.post("/add", upload, barberController.addBarber);

// Route for updating a barber
router.put("/update/:id", upload, barberController.updateBarber);

// Route for deleting a barber
router.delete("/:id", barberController.deleteBarber);

// Route for getting all barbers
router.get("/", barberController.getAllBarbers);

// Route for getting a barber's details
router.get("/:id", barberController.getBarberDetails);

module.exports = router;
