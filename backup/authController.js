const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { executeQuery } = require("../config/db"); // Importing executeQuery from db.js

// Function to generate JWT token
const generateToken = (userId, role) => {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
};

// Register User (for regular user only)
const registerUser = async (req, res) => {
  const { username, email, password } = req.body;

  try {
    // Check if user already exists
    const existingUser = await executeQuery(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );
    if (existingUser.length > 0) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the new user into the database
    const result = await executeQuery(
      "INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)",
      [username, email, hashedPassword, "user"]
    );

    // Generate a JWT token
    const token = generateToken(result.insertId, "user");

    res.status(201).json({ message: "User registered successfully", token });
  } catch (err) {
    console.error(err); // Log the error for debugging
    res.status(500).json({ error: "Something went wrong" });
  }
};

// Register Barber or Admin (admin and barber only)
const registerBarberAdmin = async (req, res) => {
  const { username, email, password, role } = req.body;

  // Ensure only 'barber' or 'admin' roles are allowed
  if (role !== "barber" && role !== "admin") {
    return res.status(400).json({ error: "Invalid role for registration" });
  }

  try {
    // Check if user already exists
    const existingUser = await executeQuery(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );
    if (existingUser.length > 0) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the new user into the database
    const result = await executeQuery(
      "INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)",
      [username, email, hashedPassword, role]
    );

    // Generate a JWT token
    const token = generateToken(result.insertId, role);

    res.status(201).json({ message: "User registered successfully", token });
  } catch (err) {
    console.error(err); // Log the error for debugging
    res.status(500).json({ error: "Something went wrong" });
  }
};

// Login Route for all users
const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find the user by email
    const users = await executeQuery("SELECT * FROM users WHERE email = ?", [
      email,
    ]);
    if (users.length === 0) {
      return res.status(400).json({ error: "User not found" });
    }

    const user = users[0];

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid password" });
    }

    // Generate a JWT token
    const token = generateToken(user.id, user.role);

    res.json({ message: "Login successful", token, role: user.role });
  } catch (err) {
    console.error(err); // Log the error for debugging
    res.status(500).json({ error: "Something went wrong" });
  }
};

module.exports = { registerUser, registerBarberAdmin, loginUser };
