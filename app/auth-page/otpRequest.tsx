import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import { auth, db } from "../../firebaseConfig";

import {
  Alert,
  BackHandler,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRegistrationStore } from "./holdRegistrationData";

const BACKEND_BASE_URL = "http://172.20.217.243:5001/api/auth";

export default function OTPVerification() {
  const router = useRouter();
  const { username, email, password, user_role, registrationNo, reset } =
    useRegistrationStore();

  const [otp, setOtp] = useState<string[]>(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);

  const inputs = useRef<(TextInput | null)[]>([]).current;
  useEffect(() => {
    const backAction = () => {
      return true;
    };

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );
    return () => backHandler.remove();
  }, []);

  useEffect(() => {
    if (!email) return;

    const sendOtp = async () => {
      try {
        const res = await fetch(`${BACKEND_BASE_URL}/send-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          Alert.alert("Error", data.message || "Failed to send OTP");
        }
      } catch (err) {
        console.error("Send OTP error:", err);
        Alert.alert("Error", "Something went wrong while sending OTP");
      }
    };

    sendOtp();
  }, [email]);

  const handleChange = (text: string, index: number) => {
    const cleaned = text.replace(/[^0-9]/g, "");
    const newOtp = [...otp];

    newOtp[index] = cleaned;
    setOtp(newOtp);

    if (cleaned && index < 5) {
      inputs[index + 1]?.focus();
    }
  };

  const handleStoreUser = async () => {
    try {
      if (!email || !password || !username || !user_role) {
        Alert.alert(
          "Error",
          "Missing registration data. Please sign up again."
        );
        router.replace("/");
        return;
      }

      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      const uid = userCredential.user.uid;

      const userData: any = {
        uid,
        email,
        username,
        user_role,
        createdAt: new Date().toISOString(),
      };

      if (user_role === "employer" && registrationNo) {
        userData.registrationNo = registrationNo;
      }

      await setDoc(doc(db, "users", uid), userData);

      Alert.alert(
        "Signup successful",
        user_role === "employer"
          ? "Welcome to SpaceCareer!"
          : "Welcome to SpaceCareer!"
      );

      reset();

      if (user_role === "employer") {
        router.replace("/");
      } else {
        router.replace("/");
      }
    } catch (error: any) {
      Alert.alert("Signup failed", error?.message);
      router.back();
    }
  };

  const handleVerifyOtp = async () => {
    const code = otp.join("");

    if (code.length !== 6) {
      Alert.alert("Invalid OTP", "Please enter the 6-digit code.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${BACKEND_BASE_URL}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: code }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        Alert.alert("OTP error", data.message || "Invalid or expired code");
        setLoading(false);
        return;
      }

      await handleStoreUser();
    } catch (err) {
      console.error("Verify OTP error:", err);
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    try {
      setOtp(["", "", "", "", "", ""]);
      inputs[0]?.focus();

      const res = await fetch(`${BACKEND_BASE_URL}/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        Alert.alert("Error", data.message || "Failed to resend OTP");
      } else {
        Alert.alert("OTP sent", "A new code has been sent to your email.");
      }
    } catch (err) {
      console.error("Resend OTP error:", err);
      Alert.alert("Error", "Failed to resend OTP");
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    const key = e.nativeEvent.key;

    if (key === "Backspace") {
      const updated = [...otp];

      if (otp[index] === "" && index > 0) {
        updated[index - 1] = "";
        setOtp(updated);
        inputs[index - 1]?.focus();
        return;
      }

      updated[index] = "";
      setOtp(updated);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="black" />
      </TouchableOpacity>

      <Image
        source={require("../../assets/images/secure_mail.png")}
        style={styles.headerImg}
      />

      <Text style={styles.title}>Verify OTP</Text>
      <Text style={styles.subtitle}>
        Enter the 6-digit code sent to {email || "your email"}
      </Text>

      <View style={styles.otpContainer}>
        {otp.map((digit, index) => (
          <TextInput
            key={index}
            style={styles.otpInput}
            value={digit}
            keyboardType="number-pad"
            maxLength={1}
            autoCorrect={false}
            autoComplete="off"
            onChangeText={(text) => handleChange(text, index)}
            onKeyPress={(e) => handleKeyPress(e, index)}
            ref={(ref) => {
              inputs[index] = ref;
            }}
          />
        ))}
      </View>

      <Text style={styles.resendText}>
        Didn{"'"}t receive code?{" "}
        <Text style={{ color: "#007bff" }} onPress={handleResendOtp}>
          Resend OTP
        </Text>
      </Text>

      <TouchableOpacity
        style={styles.button}
        onPress={handleVerifyOtp}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? "Verifying..." : "Verify OTP"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // same as your existing styles...
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#d9efffff",
  },
  backBtn: {
    position: "absolute",
    top: 95,
    left: 20,
    padding: 8,
  },
  headerImg: {
    height: 110,
    width: 110,
    alignSelf: "center",
    marginBottom: 36,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    color: "gray",
    marginBottom: 20,
    textAlign: "center",
  },
  otpContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  otpInput: {
    width: 45,
    height: 50,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    textAlign: "center",
    fontSize: 18,
    marginHorizontal: 5,
    backgroundColor: "#fff",
    fontWeight: "700",
    color: "#6f83e4ff",
  },
  resendText: {
    marginBottom: 20,
    fontSize: 14,
    color: "gray",
  },
  button: {
    padding: 10,
    borderWidth: 2,
    borderColor: "#7b9ef6ff",
    borderRadius: 30,
    width: "75%",
    alignSelf: "center",
    marginTop: 25,
    backgroundColor: "#e7eeffff",
  },
  buttonText: {
    textAlign: "center",
    fontSize: 18,
    fontWeight: "600",
    color: "#1B457C",
  },
});
