// authRoutes.js
const express = require("express");
const router = express.Router();
const nodemailer = require("nodemailer");
const { admin, db } = require("./firebase_admin");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

// POST /api/auth/send-otp
router.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email is required" });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const expiresAt = Date.now() + 10 * 60 * 1000;

    await db.collection("emailOtps").doc(email).set({
      otp,
      expiresAt,
      createdAt: Date.now(),
    });

    await transporter.sendMail({
      from: `"Career Guidance System" <${process.env.MAIL_USER}>`,
      to: email,
      subject: "Your OTP Code",
      text: `Your verification code is ${otp}. It will expire in 10 minutes.`,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("send-otp error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to send OTP email" });
  }
});

// POST /api/auth/verify-otp
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res
        .status(400)
        .json({ success: false, message: "Email and OTP are required" });
    }

    const docRef = db.collection("emailOtps").doc(email);
    const snap = await docRef.get();

    if (!snap.exists) {
      return res.status(400).json({ success: false, message: "OTP not found" });
    }

    const data = snap.data();

    if (Date.now() > data.expiresAt) {
      return res.status(400).json({ success: false, message: "OTP expired" });
    }

    if (data.otp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    await docRef.delete();

    res.json({ success: true });
  } catch (err) {
    console.error("verify-otp error:", err);
    res.status(500).json({ success: false, message: "Failed to verify OTP" });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email and new password are required",
      });
    }

    const userRecord = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(userRecord.uid, {
      password: newPassword,
    });

    await db.collection("users").doc(userRecord.uid).update({
      passwordResetAt: Date.now(),
    });

    return res.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (err) {
    console.error("reset-password error:", err);

    if (err.code === "auth/user-not-found") {
      return res
        .status(400)
        .json({ success: false, message: "No user found with this email" });
    }

    return res
      .status(500)
      .json({ success: false, message: "Failed to update password" });
  }
});

module.exports = router;
