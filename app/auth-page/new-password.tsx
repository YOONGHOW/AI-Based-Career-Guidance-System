import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  BackHandler,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const BACKEND_BASE_URL = "http://172.20.217.243:5001/api/auth";

export default function NewPassword() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const emailParam = Array.isArray(params.email)
    ? params.email[0]
    : (params.email as string | undefined);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  const validate = () => {
    let valid = true;
    setPasswordError("");
    setConfirmError("");

    if (!password) {
      setPasswordError("Password is required.");
      valid = false;
    } else if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      valid = false;
    }

    if (!confirmPassword) {
      setConfirmError("Please confirm your password.");
      valid = false;
    } else if (confirmPassword !== password) {
      setConfirmError("Passwords do not match.");
      valid = false;
    }

    return valid;
  };

  const handleSubmit = async () => {
    if (!emailParam) {
      Alert.alert("Error", "No email provided. Please restart reset process.");
      router.replace("/");
      return;
    }

    if (!validate()) return;

    try {
      setSubmitting(true);

      const res = await fetch(`${BACKEND_BASE_URL}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailParam,
          newPassword: password,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        const msg = data.message || "Failed to update password.";
        Alert.alert("Error", msg);
        return;
      }

      Alert.alert("Success", "Your password has been updated", [
        {
          text: "OK",
          onPress: () => router.replace("/"),
        },
      ]);
    } catch (err) {
      console.error("Reset password error:", err);
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#d9efffff" }}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Change Password</Text>
        </View>

        <View style={styles.box}>
          <Text style={styles.label}>Password: </Text>
          <View style={styles.passwordRow}>
            <TextInput
              placeholder="Enter your password"
              style={styles.passwordInput}
              onChangeText={(text) => {
                setPassword(text);
              }}
              value={password}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword((prev) => !prev)}
            >
              <Ionicons
                name={showPassword ? "eye-outline" : "eye-off-outline"}
                size={22}
                color="#6b6b6b"
              />
            </TouchableOpacity>
          </View>
          {passwordError ? (
            <Text style={styles.errorText}>{passwordError}</Text>
          ) : null}

          <Text style={[styles.label, { marginTop: 16 }]}>
            Confirm Password:{" "}
          </Text>
          <View style={styles.passwordRow}>
            <TextInput
              placeholder="Enter your password again"
              style={styles.passwordInput}
              onChangeText={(text) => {
                setConfirmPassword(text);
                setConfirmError("");
              }}
              value={confirmPassword}
              secureTextEntry={!showConfirmPassword}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowConfirmPassword((prev) => !prev)}
            >
              <Ionicons
                name={showConfirmPassword ? "eye-outline" : "eye-off-outline"}
                size={22}
                color="#6b6b6b"
              />
            </TouchableOpacity>
          </View>
          {confirmError ? (
            <Text style={styles.errorText}>{confirmError}</Text>
          ) : null}

          <TouchableOpacity
            style={styles.btnNext}
            onPress={handleSubmit}
            disabled={submitting}
          >
            <Text style={styles.btnText}>
              {submitting ? "Submitting..." : "Submit"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    flex: 1,
  },
  header: {
    marginVertical: 36,
    marginTop: 100,
  },
  headerTitle: {
    color: "#8BA0FF",
    fontSize: 27,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 4,
  },
  emailHint: {
    textAlign: "center",
    fontSize: 14,
    color: "#555",
  },
  box: {
    width: "100%",
    height: "auto",
    padding: 20,
    borderRadius: 12,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 4,
    marginTop: -10,
  },
  label: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1B457C",
  },
  btnNext: {
    padding: 10,
    borderWidth: 2,
    borderColor: "#7b9ef6ff",
    borderRadius: 30,
    width: "75%",
    alignSelf: "center",
    marginTop: 25,
    backgroundColor: "#e7eeffff",
  },
  btnText: {
    textAlign: "center",
    fontSize: 18,
    fontWeight: "600",
    color: "#1B457C",
  },
  _textInput: {
    marginBottom: 4,
    marginTop: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#7b9ef6ff",
    fontSize: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  errorText: {
    color: "red",
    fontSize: 13,
    marginBottom: 4,
  },

  passwordRow: {
    marginTop: 10,
    marginBottom: 8,
    height: 50,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#7b9ef6ff",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    backgroundColor: "#f9fbff",
  },
  passwordInput: {
    flex: 1,
    fontSize: 16,
  },
  eyeBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
});
