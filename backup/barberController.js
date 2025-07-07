const { executeQuery } = require("../config/db");
const Joi = require("joi");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const barberSchema = Joi.object({
  name: Joi.string().required(),
  latitude: Joi.number().optional(),
  longitude: Joi.number().optional(),
  services: Joi.string().required(),
  paket: Joi.string().required(),
  paket_description: Joi.string().optional().default(""),
  price: Joi.number().required(),
  profile_image: Joi.string().optional(),
  bank_name: Joi.string().optional(), // Add validation for bank_name
  account_number: Joi.string().optional(), // Add validation for account_number
  payment_method: Joi.string().valid("tf", "qris").optional(), // Add validation for payment_method
});

// Multer configuration for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const profileDir = "uploads/profile";
    const galleryDir = "uploads/gallery";

    // Ensure directories exist
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }
    if (!fs.existsSync(galleryDir)) {
      fs.mkdirSync(galleryDir, { recursive: true });
    }

    // Store profile images in 'uploads/profile', gallery images in 'uploads/gallery'
    if (file.fieldname === "profileImage") {
      cb(null, profileDir);
    } else {
      cb(null, galleryDir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix =
      Date.now() +
      "-" +
      Math.round(Math.random() * 1e9) +
      path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix);
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

// Add barber
const addBarber = async (req, res) => {
  console.log(req.files);
  try {
    const { error, value } = barberSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const {
      name,
      latitude,
      longitude,
      services,
      paket,
      paket_description,
      price,
      bank_name, // New field
      account_number, // New field
      payment_method, // New field
    } = value;

    // Handle profile image and gallery images gracefully
    const profileImage = req.files?.profileImage
      ? "/uploads/profile/" + req.files.profileImage[0].filename
      : null;
    const galleryImages = req.files?.galleryImages
      ? req.files.galleryImages.map(
          (file) => "/uploads/gallery/" + file.filename
        )
      : [];

    // Insert barber details
    const result = await executeQuery(
      "INSERT INTO barbers (name, latitude, longitude, services, paket, paket_description, price, profile_image, bank_name, account_number, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        name,
        latitude,
        longitude,
        services,
        paket,
        paket_description,
        price,
        profileImage,
        bank_name,
        account_number,
        payment_method,
      ]
    );

    // Insert gallery images
    for (let image of galleryImages) {
      await executeQuery(
        "INSERT INTO gallery_images (barber_id, image_url) VALUES (?, ?)",
        [result.insertId, image]
      );
    }

    return res.status(201).json({
      message: "Barber added successfully",
      barber: {
        id: result.insertId,
        name,
        latitude,
        longitude,
        services,
        paket,
        paket_description,
        price,
        profile_image: profileImage,
        bank_name,
        account_number,
        payment_method,
        gallery_images: galleryImages,
      },
    });
  } catch (err) {
    console.error("Error adding barber:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Update barber
const updateBarber = async (req, res) => {
  const { id } = req.params;

  try {
    const { error, value } = barberSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const {
      name,
      services,
      paket,
      paket_description,
      price,
      profile_image,
      bank_name,
      account_number,
      payment_method,
    } = value;

    const updatedData = {
      name,
      services,
      paket,
      paket_description,
      price,
      profile_image: profile_image || null,
      bank_name,
      account_number,
      payment_method,
    };

    const result = await executeQuery(
      "UPDATE barbers SET name = ?, services = ?, paket = ?, paket_description = ?, price = ?, profile_image = ?, bank_name = ?, account_number = ?, payment_method = ? WHERE id = ?",
      [
        updatedData.name,
        updatedData.services,
        updatedData.paket,
        updatedData.paket_description,
        updatedData.price,
        updatedData.profile_image,
        updatedData.bank_name,
        updatedData.account_number,
        updatedData.payment_method,
        id,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Barber not found" });
    }

    return res.json({
      message: "Barber updated successfully",
      barber: {
        id,
        name: updatedData.name,
        services: updatedData.services,
        paket: updatedData.paket,
        paket_description: updatedData.paket_description,
        price: updatedData.price,
        profile_image: updatedData.profile_image,
        bank_name: updatedData.bank_name,
        account_number: updatedData.account_number,
        payment_method: updatedData.payment_method,
      },
    });
  } catch (err) {
    console.error("Error updating barber:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Delete barber
const deleteBarber = async (req, res) => {
  const { id } = req.params;
  try {
    // Delete associated bookings
    await executeQuery("DELETE FROM bookings WHERE barber_id = ?", [id]);

    // Delete associated gallery images
    await executeQuery("DELETE FROM gallery_images WHERE barber_id = ?", [id]);

    // Delete associated images in barber_images table
    await executeQuery("DELETE FROM barber_images WHERE barber_id = ?", [id]);

    // Finally, delete the barber
    const result = await executeQuery("DELETE FROM barbers WHERE id = ?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Barber not found" });
    }

    return res.json({ message: "Barber deleted successfully" });
  } catch (err) {
    console.error("Error deleting barber:", err);
    return res
      .status(500)
      .json({ error: "Internal server error while deleting barber" });
  }
};

// Get all barbers
const getAllBarbers = async (req, res) => {
  try {
    const barbers = await executeQuery("SELECT * FROM barbers");

    const barbersWithImages = await Promise.all(
      barbers.map(async (barber) => {
        const galleryImages = await executeQuery(
          "SELECT image_url FROM gallery_images WHERE barber_id = ?",
          [barber.id]
        );

        return {
          ...barber,
          gallery_images: galleryImages.map((img) => img.image_url),
        };
      })
    );

    res.status(200).json(barbersWithImages);
  } catch (err) {
    console.error("Error fetching barbers:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get barber details by ID
const getBarberDetails = async (req, res) => {
  const { id } = req.params;
  try {
    // Get barber details
    const result = await executeQuery("SELECT * FROM barbers WHERE id = ?", [
      id,
    ]);

    if (result.length === 0) {
      return res.status(404).json({ message: "Barber not found" });
    }

    // Get the gallery images for the barber
    const galleryImages = await executeQuery(
      "SELECT image_url FROM gallery_images WHERE barber_id = ?",
      [id]
    );

    // Return the barber details along with gallery images
    res.json({
      ...result[0],
      gallery_images: galleryImages.map((img) => img.image_url), // Ensure this is mapped correctly
    });
  } catch (err) {
    console.error("Error fetching barber details:", err);
    res.status(500).json({
      error: "Internal server error while fetching barber details",
    });
  }
};

module.exports = {
  getAllBarbers,
  getBarberDetails,
  addBarber,
  updateBarber,
  deleteBarber,
};
