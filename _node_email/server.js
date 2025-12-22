// server.js
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./auth_route");

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// test route
app.get("/", (req, res) => {
  res.send("OTP backend running");
});

// auth routes
app.use("/api/auth", authRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
