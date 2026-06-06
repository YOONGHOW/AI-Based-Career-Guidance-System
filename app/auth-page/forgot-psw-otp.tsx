import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
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

const BACKEND_BASE_URL = "http://192.168.100.28:5001/api/auth";

export default function OTPVerification() {
  const router = useRouter();

  const params = useLocalSearchParams();
  const emailParam = Array.isArray(params.email)
    ? params.email[0]
    : (params.email as string | undefined);

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
    if (!emailParam) {
      Alert.alert("Error", "No email provided. Please try again.");
      router.back();
      return;
    }

    const sendOtp = async () => {
      try {
        const res = await fetch(`${BACKEND_BASE_URL}/send-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: emailParam }),
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
  }, [emailParam]);

  const handleChange = (text: string, index: number) => {
    const cleaned = text.replace(/[^0-9]/g, "");
    const newOtp = [...otp];
    newOtp[index] = cleaned;
    setOtp(newOtp);

    if (cleaned && index < 5) {
      inputs[index + 1]?.focus();
    }
  };

  const handleVerifyOtp = async () => {
    const code = otp.join("");

    if (code.length !== 6) {
      Alert.alert("Invalid OTP", "Please enter the 6-digit code.");
      return;
    }

    if (!emailParam) {
      Alert.alert("Error", "No email provided. Please try again.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${BACKEND_BASE_URL}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailParam, otp: code }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        Alert.alert("OTP error", data.message || "Invalid or expired code");
        setLoading(false);
        return;
      }

      router.replace({
        pathname: "../auth-page/new-password",
        params: { email: emailParam },
      });
    } catch (err) {
      console.error("Verify OTP error:", err);
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!emailParam) {
      Alert.alert("Error", "No email provided. Please try again.");
      return;
    }

    try {
      setOtp(["", "", "", "", "", ""]);
      inputs[0]?.focus();

      const res = await fetch(`${BACKEND_BASE_URL}/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailParam }),
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
        Enter the 6-digit code sent to {emailParam || "your email"}
      </Text>

      <View style={styles.otpContainer}>
        {otp.map((digit, index) => (
          <TextInput
            key={index}
            style={styles.otpInput}
            value={digit}
            keyboardType="number-pad"
            maxLength={1}
            onChangeText={(text: string) => handleChange(text, index)}
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
