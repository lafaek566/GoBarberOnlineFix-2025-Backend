const express = require("express");
const authController = require("../controllers/authController");

const router = express.Router();

// Register User (for regular user only)
router.post("/register-user", authController.registerUser);

// Register Barber (specific to barbers)
router.post("/register-barber", authController.registerBarber);

// Register Barber or Admin (for admin and barber only)
router.post("/register-admin", authController.registerBarberAdmin);

// Login Route for all users
router.post("/login", authController.loginUser);

// Get all users
router.get("/", authController.getAllUsers);

// Add the route to get user by ID
router.get("/:id", authController.getUserById);

// Delete user by ID
router.delete("/:id", authController.deleteUser);

// Update user details by ID
router.put("/:id", authController.updateUser);

module.exports = router;
