import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { collection, getDocs, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { db } from "../../firebaseConfig";
import { useRegistrationStore } from "./holdRegistrationData";

export default function RegisterScreen() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  //Error State
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const setAll = useRegistrationStore((s) => s.setAll);
  const [passwordStrength, setPasswordStrength] = useState<
    "weak" | "medium" | "strong" | null
  >(null);

  const getPasswordStrength = (pwd: string): "weak" | "medium" | "strong" => {
    let score = 0;

    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;

    if (score <= 1) return "weak";
    if (score === 2 || score === 3) return "medium";
    return "strong";
  };

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

  const handleSignup = async () => {
    let isValid = true;

    try {
      setEmailError("");
      setPasswordError("");
      setConfirmError("");
      setUsernameError("");

      if (!username) {
        setUsernameError("Username is required");
        isValid = false;
      }
      const trimmedEmail = email.trim();

      const q = query(
        collection(db, "users"),
        where("email", "==", trimmedEmail)
      );
      const snap = await getDocs(q);

      if (!email) {
        setEmailError("Email is required");
        isValid = false;
      } else if (!/\S+@\S+\.\S+/.test(email)) {
        setEmailError("Enter a valid email");
        isValid = false;
      } else if (!snap.empty) {
        setEmailError("Email already exists");
        isValid = false;
      }

      if (!password) {
        setPasswordError("Password is required");
        isValid = false;
      } else if (password.length < 8) {
        setPasswordError("Password must be at least 8 characters");
        isValid = false;
      }

      if (!confirmPassword) {
        setConfirmError("Please confirm your password");
        isValid = false;
      } else if (password !== confirmPassword) {
        setConfirmError("Passwords do not match");
        isValid = false;
      }

      if (!isValid) return;
      setAll({
        username,
        email,
        password,
        user_role: "job-seeker",
        registrationNo: null,
      });
      router.push("/auth-page/otpRequest");
    } catch {
      Alert.alert("Email already exists");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#d9efffff" }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.container}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => router.back()}
            >
              <Ionicons name="arrow-back" size={24} color="black" />
            </TouchableOpacity>

            <View style={styles.header}>
              <Text style={styles.headerTitle}>Sign Up</Text>
            </View>

            <View style={styles.box}>
              {/* Username */}
              <Text style={styles.label}>Username: </Text>
              <TextInput
                placeholder="Enter your name"
                style={styles._textInput}
                value={username}
                onChangeText={(text) => {
                  const cleaned = text.replace(/^\s+/, "");
                  setUsername(cleaned);
                  setUsernameError("");
                }}
              />
              {usernameError ? (
                <Text style={styles.error}>{usernameError}</Text>
              ) : null}

              {/* Email */}
              <Text style={styles.label}>Email: </Text>
              <TextInput
                placeholder="Enter your email"
                style={styles._textInput}
                onChangeText={(text) => {
                  const cleaned = text.replace(/\s+/g, "");
                  setEmail(cleaned);
                  setEmailError("");
                }}
                value={email}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              {emailError ? (
                <Text style={styles.error}>{emailError}</Text>
              ) : null}

              {/* Password */}
              <Text style={styles.label}>Password: </Text>
              <View style={styles.passwordRow}>
                <TextInput
                  placeholder="Enter your password"
                  style={styles.passwordInput}
                  onChangeText={(text) => {
                    setPassword(text);
                    setPasswordError("");

                    if (text) {
                      setPasswordStrength(getPasswordStrength(text));
                    } else {
                      setPasswordStrength(null);
                    }
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
              {passwordStrength && (
                <View style={styles.strengthContainer}>
                  <View style={styles.strengthBarBackground}>
                    <View
                      style={[
                        styles.strengthBarFill,
                        passwordStrength === "weak" && {
                          width: "33%",
                          backgroundColor: "#ff4d4f", // red = high risk
                        },
                        passwordStrength === "medium" && {
                          width: "66%",
                          backgroundColor: "#fbbc05", // yellow = medium
                        },
                        passwordStrength === "strong" && {
                          width: "100%",
                          backgroundColor: "#34a853", // green = safe
                        },
                      ]}
                    />
                  </View>
                  <Text
                    style={[
                      styles.strengthLabel,
                      passwordStrength === "weak" && { color: "#ff4d4f" },
                      passwordStrength === "medium" && { color: "#fbbc05" },
                      passwordStrength === "strong" && { color: "#34a853" },
                    ]}
                  >
                    {passwordStrength === "weak"
                      ? "Password risk: High"
                      : passwordStrength === "medium"
                      ? "Password risk: Medium"
                      : "Password risk: Safe"}
                  </Text>
                </View>
              )}

              {passwordError ? (
                <Text style={styles.error}>{passwordError}</Text>
              ) : null}

              {/* Confirm Password */}
              <Text style={styles.label}>Confirm Password: </Text>
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
                    name={
                      showConfirmPassword ? "eye-outline" : "eye-off-outline"
                    }
                    size={22}
                    color="#6b6b6b"
                  />
                </TouchableOpacity>
              </View>
              {confirmError ? (
                <Text style={styles.error}>{confirmError}</Text>
              ) : null}

              <TouchableOpacity style={styles.btnNext} onPress={handleSignup}>
                <Text style={styles.btnText}>Register</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    flex: 1,
  },
  header: {
    marginTop: 60,
    marginBottom: 30,
  },
  headerTitle: {
    color: "#8BA0FF",
    fontSize: 27,
    fontWeight: "700",
    textAlign: "center",
  },
  box: {
    width: "100%",
    padding: 20,
    borderRadius: 12,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 4,
  },
  label: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1B457C",
    marginTop: 6,
  },
  backBtn: {
    position: "absolute",
    top: 40,
    left: 20,
    padding: 8,
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
    marginBottom: 8,
    marginTop: 10,
    height: 50,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#7b9ef6ff",
    fontSize: 16,
    paddingHorizontal: 10,
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
  },
  passwordInput: {
    flex: 1,
    fontSize: 16,
  },
  eyeBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  error: {
    color: "#de0000ff",
    fontSize: 12,
    marginTop: -2,
  },
  strengthContainer: {
    marginTop: 4,
    marginBottom: 4,
  },

  strengthBarBackground: {
    height: 6,
    borderRadius: 4,
    backgroundColor: "#e5e5e5",
    overflow: "hidden",
  },

  strengthBarFill: {
    height: "100%",
    borderRadius: 4,
  },

  strengthLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "500",
  },
});
