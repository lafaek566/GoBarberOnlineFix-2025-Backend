const express = require("express");
const router = express.Router();
const {
  addReview,
  updateReviewByBarberId,
  getReviews,
  getReviewById,
  getAllReviews,
  deleteReview,
} = require("../controllers/reviewController");

// Route to add a review
router.post("/add", addReview);

// Route to update a review by its ID
router.put("/:barberId", updateReviewByBarberId);

// Route to get reviews for a specific barber
router.get("/:barberId", getReviews);

// Route to get a specific review by its ID
router.get("/:reviewId", getReviewById);

router.get("/", getAllReviews);

// Route to delete a review by its ID
router.delete("/:reviewId", deleteReview);

module.exports = router;
