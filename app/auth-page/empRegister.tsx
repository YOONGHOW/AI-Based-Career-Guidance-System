import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { collection, getDocs, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
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
  const setAll = useRegistrationStore((s) => s.setAll);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [registrationNo, setRegistrationNo] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [registrationNoError, setRegistrationNoError] = useState("");

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

    setEmailError("");
    setPasswordError("");
    setConfirmError("");
    setUsernameError("");
    setRegistrationNoError("");

    if (!username.trim()) {
      setUsernameError("Company name is required");
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

    if (!registrationNo) {
      setRegistrationNoError("Registration No is required");
      isValid = false;
    } else if (registrationNo.length !== 12) {
      setRegistrationNoError("Registration No must be 12 numbers");
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
      username: username.trim(),
      email: email.trim(),
      password,
      user_role: "employer",
      registrationNo,
    });

    router.push("/auth-page/otpRequest");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#d9efffff" }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 30 : 0}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          <View style={styles.container}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => router.back()}
            >
              <Ionicons name="arrow-back" size={24} color="black" />
            </TouchableOpacity>

            <View style={styles.header}>
              <Text style={styles.headerTitle}>Employer Sign Up</Text>
            </View>

            <View style={styles.box}>
              <Text style={styles.label}>Company name:</Text>
              <TextInput
                placeholder="Enter company name"
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

              <Text style={styles.label}>Company email:</Text>
              <TextInput
                placeholder="Enter company email"
                style={styles._textInput}
                onChangeText={(text) => {
                  const cleaned = text.replace(/\s+/g, "").toLowerCase();
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

              <Text style={styles.label}>Registration No:</Text>
              <TextInput
                placeholder="Enter your registration no"
                style={styles._textInput}
                onChangeText={(text) => {
                  setRegistrationNo(text.replace(/[^0-9]/g, ""));
                  setRegistrationNoError("");
                }}
                value={registrationNo}
                keyboardType="number-pad"
              />
              {registrationNoError ? (
                <Text style={styles.error}>{registrationNoError}</Text>
              ) : null}

              <Text style={styles.label}>Password: </Text>
              <View style={styles.passwordRow}>
                <TextInput
                  placeholder="Enter your password"
                  style={styles.passwordInput}
                  onChangeText={(text) => {
                    setPassword(text);
                    setPasswordError("");
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
                <Text style={styles.error}>{passwordError}</Text>
              ) : null}

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
                <Text style={styles.btnText}>Sign Up</Text>
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
    padding: "5%",
    flex: 1,
  },
  header: {
    marginTop: "15%",
    marginVertical: "8%",
  },
  headerTitle: {
    color: "#8BA0FF",
    fontSize: 24,
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
    marginTop: "-1%",
  },
});
