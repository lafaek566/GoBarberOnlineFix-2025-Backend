const { executeQuery } = require("../config/db");

exports.addReview = async (req, res) => {
  const { barberId, rating, comment, username } = req.body;

  // Validate required fields
  if (!barberId || !rating || !comment) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    // Insert review with optional username
    const query =
      "INSERT INTO reviews (barber_id, rating, comment, username) VALUES (?, ?, ?, ?)";
    const values = username
      ? [barberId, rating, comment, username]
      : [barberId, rating, comment, null];

    await executeQuery(query, values);

    res.status(201).json({ message: "Review added successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.addReview = async (req, res) => {
  const { barberId, rating, comment, username } = req.body;

  // Input validation
  if (!barberId || !rating || !comment) {
    return res
      .status(400)
      .json({ message: "Barber ID, rating, and comment are required" });
  }

  try {
    // Insert review with optional username
    const result = await executeQuery(
      "INSERT INTO reviews (barber_id, rating, comment, username) VALUES (?, ?, ?, ?)",
      [barberId, rating, comment, username || null] // Ensure username can be null
    );

    if (result.affectedRows > 0) {
      res.status(201).json({ message: "Review added successfully" });
    } else {
      res.status(500).json({ message: "Failed to add review" });
    }
  } catch (err) {
    console.error("Error adding review:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.updateReviewByBarberId = async (req, res) => {
  const { barberId } = req.params; // Mengambil barberId dari parameter URL
  const { rating, comment, username } = req.body;

  try {
    // Periksa apakah review dengan barber_id ada
    const reviews = await executeQuery(
      "SELECT * FROM reviews WHERE barber_id = ?",
      [barberId]
    );

    if (!reviews || reviews.length === 0) {
      return res
        .status(404)
        .send({ message: "Reviews for this barber not found" });
    }

    // Update semua review untuk barber_id tertentu
    const updatedReviews = await executeQuery(
      `UPDATE reviews SET rating = ?, comment = ?, username = ? WHERE barber_id = ?`,
      [rating, comment, username, barberId]
    );

    if (updatedReviews.affectedRows > 0) {
      res.status(200).send({ message: "Review(s) updated successfully" });
    } else {
      res.status(400).send({ message: "No changes made to the reviews" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Error updating review(s)" });
  }
};

exports.getAllReviews = async (req, res) => {
  try {
    const reviews = await executeQuery(
      `SELECT reviews.*, users.username AS userName, barbers.name AS barberName
       FROM reviews
       LEFT JOIN users ON reviews.username = users.username
       LEFT JOIN barbers ON reviews.barber_id = barbers.id`
    );

    res.status(200).json(reviews);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error retrieving all reviews" });
  }
};

exports.getReviews = async (req, res) => {
  const { barberId } = req.params;
  try {
    const reviews = await executeQuery(
      `
      SELECT 
        reviews.*, 
        users.username AS userName, 
        barbers.name AS barberName
      FROM reviews
      LEFT JOIN users ON reviews.user_id = users.id
      LEFT JOIN barbers ON reviews.barber_id = barbers.id
      WHERE reviews.barber_id = ?
      `,
      [barberId]
    );

    console.log(reviews); // Debugging untuk memastikan hasil query

    if (reviews.length === 0) {
      return res
        .status(404)
        .json({ message: "Tidak ada review untuk barber ini." });
    }
    res.json(reviews);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
};

exports.getReviewById = async (req, res) => {
  const { reviewId } = req.params;
  try {
    const review = await executeQuery(
      `
      SELECT 
        reviews.*, 
        users.username AS userName, 
        barbers.name AS barberName
      FROM reviews
      LEFT JOIN users ON reviews.user_id = users.id
      LEFT JOIN barbers ON reviews.barber_id = barbers.id
      WHERE reviews.id = ?
      `,
      [reviewId]
    );

    if (review.length === 0) {
      return res
        .status(404)
        .json({ message: "Review dengan ID ini tidak ditemukan." });
    }
    res.json(review[0]); // Return the first review, since ID is unique
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil review" });
  }
};

// In your reviews controller:
exports.deleteReview = async (req, res) => {
  const reviewId = req.params.reviewId;

  try {
    console.log(`Fetching review with ID: ${reviewId}`);
    const review = await executeQuery("SELECT * FROM reviews WHERE id = ?", [
      reviewId,
    ]);

    if (!review || review.length === 0) {
      console.log("Review not found in the database");
      return res.status(404).send({ message: "Review not found" });
    }

    console.log("Review found, proceeding to delete");
    const result = await executeQuery("DELETE FROM reviews WHERE id = ?", [
      reviewId,
    ]);

    if (result.affectedRows > 0) {
      res.status(200).send({ message: "Review deleted successfully" });
    } else {
      console.log("Review delete query did not affect any rows");
      res.status(404).send({ message: "Review not found" });
    }
  } catch (err) {
    console.error("Error while deleting review:", err);
    res.status(500).send({ message: "Error deleting review" });
  }
};
