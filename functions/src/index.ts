import cors from "cors";
import crypto from "crypto";
import express from "express";
import * as admin from "firebase-admin";
import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2/options";
import type { RequestInfo, RequestInit } from "node-fetch";

setGlobalOptions({
  region: "asia-southeast1",
  timeoutSeconds: 60,
  memory: "256MiB",
});
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const MAIL_FROM = defineSecret("MAIL_FROM");
const fetchFn = async (url: RequestInfo, init?: RequestInit) => {
  const { default: fetch } = await import("node-fetch");
  return fetch(url, init);
};
admin.initializeApp();
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
const db = admin.firestore();

function genOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

app.post("/send-otp", async (req, res) => {
  try {
    const email = (req.body?.email || "").toLowerCase().trim();
    if (!email) return res.status(400).json({ error: "Email required" });

    const code = genOTP();
    const salt = crypto.randomBytes(8).toString("hex");
    const codeHash = sha256(code + salt);
    const now = admin.firestore.Timestamp.now();
    const expiresAt = admin.firestore.Timestamp.fromMillis(
      now.toMillis() + 15 * 60 * 1000
    );

    const id = sha256(email);
    const docRef = db.collection("otp_requests").doc(id);
    const snap = await docRef.get();
    const prev = snap.exists ? snap.data() : {};

    // throttle & limits
    const lastSentAtMs = prev?.lastSentAt?.toMillis?.() ?? 0;
    if (now.toMillis() - lastSentAtMs < 60 * 1000) {
      return res.status(429).json({ error: "Please wait before resending." });
    }
    const resendCount = (prev?.resendCount ?? 0) + 1;
    if (resendCount > 5) {
      return res.status(429).json({ error: "Resend limit reached." });
    }

    await docRef.set(
      {
        email,
        codeHash,
        salt,
        expiresAt,
        attempts: 0,
        resendCount,
        lastSentAt: now,
        consumed: false,
      },
      { merge: true }
    );

    // Send email (Resend example)

    const apiKey = RESEND_API_KEY.value();
    const from = MAIL_FROM.value();
    const resp = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Your SpaceCareer OTP",
        text: `Your OTP is ${code}. It expires in 15 minutes. Do not share it.`,
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return res.status(500).json({ error: "Failed to send email", trace: t });
    }

    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message ?? "Internal error" });
  }
});

app.post("/verify-otp", async (req, res) => {
  try {
    const email = (req.body?.email || "").toLowerCase().trim();
    const code = (req.body?.code || "").trim();
    if (!email || !code)
      return res.status(400).json({ error: "Missing email or code" });

    const docRef = db.collection("otp_requests").doc(sha256(email));
    const snap = await docRef.get();
    if (!snap.exists)
      return res.status(400).json({ error: "No OTP requested." });

    const data = snap.data()!;
    if (data.consumed)
      return res.status(400).json({ error: "Code already used." });
    if (
      admin.firestore.Timestamp.now().toMillis() > data.expiresAt.toMillis()
    ) {
      return res.status(400).json({ error: "Code expired." });
    }
    if ((data.attempts ?? 0) >= 5) {
      return res.status(429).json({ error: "Too many attempts." });
    }

    const ok = sha256(code + data.salt) === data.codeHash;
    if (!ok) {
      await docRef.update({ attempts: (data.attempts ?? 0) + 1 });
      return res.status(400).json({ error: "Invalid code." });
    }

    await docRef.update({ consumed: true });
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message ?? "Internal error" });
  }
});

export const api = onRequest({ secrets: [RESEND_API_KEY, MAIL_FROM] }, app);
