const jwt = require("jsonwebtoken");

const checkRole = (roles) => {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1]; // Get token from Authorization header
    if (!token) {
      return res.status(403).json({ error: "No token provided" });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (roles.includes(decoded.role)) {
        req.user = decoded; // Attach decoded user to request
        next();
      } else {
        return res.status(403).json({ error: "You do not have permission" });
      }
    } catch (err) {
      return res.status(401).json({ error: "Invalid token" });
    }
  };
};

module.exports = checkRole;
