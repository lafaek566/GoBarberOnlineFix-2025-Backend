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

// Register Barber
const registerBarber = async (req, res) => {
  const { username, email, password } = req.body;

  try {
    // Check if barber already exists
    const existingUser = await executeQuery(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );
    if (existingUser.length > 0) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the new barber into the database
    const result = await executeQuery(
      "INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)",
      [username, email, hashedPassword, "barber"]
    );

    // Generate a JWT token for the barber
    const token = generateToken(result.insertId, "barber");

    res.status(201).json({ message: "Barber registered successfully", token });
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

// Get all users
const getAllUsers = async (req, res) => {
  try {
    const users = await executeQuery("SELECT * FROM users");

    res.status(200).json({ users });
  } catch (err) {
    console.error(err); // Log the error for debugging
    res.status(500).json({ error: "Something went wrong" });
  }
};

// Get user by ID
const getUserById = async (req, res) => {
  const { id } = req.params; // Extract the user ID from the request parameters

  try {
    // Find the user by ID
    const users = await executeQuery("SELECT * FROM users WHERE id = ?", [id]);
    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = users[0]; // Get the first (and only) user from the result
    res.status(200).json({ user });
  } catch (err) {
    console.error(err); // Log the error for debugging
    res.status(500).json({ error: "Something went wrong" });
  }
};

// Delete a user
const deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    // Check if user exists
    const existingUser = await executeQuery(
      "SELECT * FROM users WHERE id = ?",
      [id]
    );
    if (existingUser.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Delete user
    await executeQuery("DELETE FROM users WHERE id = ?", [id]);

    res.status(200).json({ message: "User deleted successfully" });
  } catch (err) {
    console.error(err); // Log the error for debugging
    res.status(500).json({ error: "Something went wrong" });
  }
};

// Update a user's details
const updateUser = async (req, res) => {
  const { id } = req.params; // Now you're accessing the correct parameter 'id'
  console.log("Updating user with ID:", id); // Log the user ID

  const { username, email, password, role } = req.body;

  try {
    const existingUser = await executeQuery(
      "SELECT * FROM users WHERE id = ?",
      [id]
    );

    if (existingUser.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const hashedPassword = password
      ? await bcrypt.hash(password, 10)
      : undefined;

    await executeQuery(
      "UPDATE users SET username = ?, email = ?, password = ?, role = ? WHERE id = ?",
      [
        username || existingUser[0].username,
        email || existingUser[0].email,
        hashedPassword || existingUser[0].password,
        role || existingUser[0].role,
        id,
      ]
    );

    res.status(200).json({ message: "User updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
};

module.exports = {
  registerUser,
  registerBarber,
  registerBarberAdmin,
  loginUser,
  getAllUsers,
  getUserById,
  deleteUser,
  updateUser,
};
