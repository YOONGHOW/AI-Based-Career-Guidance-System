import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { collection, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
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
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import universities from "../../assets/universities.json";
import { auth, db } from "../../firebaseConfig";

// 🔵 Updated to match ML training dataset fields
const FIELD_OF_STUDY_OPTIONS = [
  "Computer Science",
  "Information Technology",
  "Software Engineering",
  "Data Science",
  "Statistics",
  "Artificial Intelligence",
  "Business Information Systems",
  "Information Systems",
  "Business Administration",
  "Accounting & Finance",
  "Banking",
  "Marketing",
  "Human Resource Management",
  "Management",
  "Mechanical Engineering",
  "Electrical Engineering",
  "Electronics Engineering",
  "Mechatronics",
  "Civil Engineering",
  "Chemical Engineering",
  "Nursing",
  "Pharmacy",
  "Graphic Design",
  "Multimedia",
  "Education",
  "Psychology",
  "Supply Chain Management",
  "Logistics",
  "Mass Communication",
  "Hospitality & Tourism",
];

const EDUCATION_LEVEL_OPTIONS = [
  "Diploma",
  "Bachelor's Degree",
  "Master's Degree",
  "Doctorate (PhD)",
];

export default function EducationSetup() {
  const router = useRouter();
  const user = auth.currentUser;

  const [_university, setUniversity] = useState("");
  const [_educationLevel, setEducationLevel] = useState("");
  const [_fieldOfStudy, setFieldOfStudy] = useState("");
  const [_academicResult, setAcademicResult] = useState("");

  const [educationId, setEducationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Suggestion states
  const [fieldSuggestions, setFieldSuggestions] = useState<string[]>([]);
  const [showFieldSuggestions, setShowFieldSuggestions] = useState(false);

  const [levelSuggestions, setLevelSuggestions] = useState<string[]>([]);
  const [showLevelSuggestions, setShowLevelSuggestions] = useState(false);

  const [universitySuggestions, setUniversitySuggestions] = useState<string[]>(
    []
  );
  const [showUniversitySuggestions, setShowUniversitySuggestions] =
    useState(false);

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
    const loadEducation = async () => {
      try {
        if (!user) return;

        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) return;

        const userData = userSnap.data() || {};
        const eduId = userData.educationId as string | undefined;

        if (!eduId) return;

        setEducationId(eduId);

        const eduRef = doc(db, "education", eduId);
        const eduSnap = await getDoc(eduRef);

        if (eduSnap.exists()) {
          const data: any = eduSnap.data();
          setUniversity(data.university || "");
          setEducationLevel(data.education_level || "");
          setFieldOfStudy(data.field_of_study || "");
          setAcademicResult(
            data.academic_result !== null && data.academic_result !== undefined
              ? String(data.academic_result)
              : ""
          );
        }
      } catch (err) {
        console.error("Error loading education:", err);
      }
    };

    loadEducation();
  }, [user]);

  if (!user) {
    return null;
  }

  const handleAddEducation = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        Alert.alert("Error", "User not logged in");
        return;
      }

      const trimmedField = _fieldOfStudy.trim();
      if (!trimmedField) {
        Alert.alert("Validation", "Please select your field of study.");
        return;
      }

      setLoading(true);

      const userRef = doc(db, "users", currentUser.uid);

      const trimmedUniversity = _university.trim();
      const trimmedLevel = _educationLevel.trim();
      const trimmedResult = _academicResult.trim();

      if (!trimmedUniversity) {
        Alert.alert("Validation", "Please enter your university name.");
        return;
      }

      if (!trimmedLevel) {
        Alert.alert("Validation", "Please enter your education level.");
        return;
      }
      if (!trimmedResult) {
        Alert.alert("Validation", "Please enter your academic result.");
        return;
      }

      if (educationId) {
        const eduRef = doc(db, "education", educationId);
        const data = {
          university: trimmedUniversity || null,
          education_level: trimmedLevel || null,
          field_of_study: trimmedField || null,
          academic_result: trimmedResult || null,
          updatedAt: new Date(),
        };

        await updateDoc(eduRef, data);
        Alert.alert("Success", "Education updated successfully!");
      } else {
        const newDocRef = doc(collection(db, "education"));

        const data = {
          id: newDocRef.id,
          userId: currentUser.uid,
          university: trimmedUniversity || null,
          education_level: trimmedLevel || null,
          field_of_study: trimmedField || null,
          academic_result: trimmedResult || null,
          createdAt: new Date(),
        };

        await setDoc(newDocRef, data);
        await updateDoc(userRef, {
          educationId: newDocRef.id,
        });

        setEducationId(newDocRef.id);
        Alert.alert("Success", "Education added successfully!");
      }

      router.push("/(job-seekerTabs)/profile");
    } catch (error: any) {
      console.error(error);
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUniversityChange = (text: string) => {
    setUniversity(text);
    setShowFieldSuggestions(false);
    setShowLevelSuggestions(false);
    if (!text.trim()) {
      setUniversitySuggestions([]);
      setShowUniversitySuggestions(false);
      return;
    }

    const filtered = (universities as string[]).filter((name) =>
      name.toLowerCase().includes(text.toLowerCase())
    );

    setUniversitySuggestions(filtered.slice(0, 10));
    setShowUniversitySuggestions(filtered.length > 0);
  };

  const handleSelectUniversity = (value: string) => {
    setUniversity(value);
    setShowUniversitySuggestions(false);
  };

  const handleFieldChange = (text: string) => {
    setFieldOfStudy(text);
    setShowFieldSuggestions(false);
    setShowUniversitySuggestions(false);
    if (!text.trim()) {
      setFieldSuggestions([]);
      setShowFieldSuggestions(false);
      return;
    }

    const filtered = FIELD_OF_STUDY_OPTIONS.filter((opt) =>
      opt.toLowerCase().includes(text.toLowerCase())
    );

    setFieldSuggestions(filtered);
    setShowFieldSuggestions(filtered.length > 0);
  };

  const handleSelectField = (value: string) => {
    setFieldOfStudy(value);
    setShowFieldSuggestions(false);
  };

  const handleLevelChange = (text: string) => {
    setEducationLevel(text);
    setShowFieldSuggestions(false);
    setShowUniversitySuggestions(false);
    if (!text.trim()) {
      setLevelSuggestions([]);
      setShowLevelSuggestions(false);
      return;
    }

    const filtered = EDUCATION_LEVEL_OPTIONS.filter((opt) =>
      opt.toLowerCase().includes(text.toLowerCase())
    );

    setLevelSuggestions(filtered);
    setShowLevelSuggestions(filtered.length > 0);
  };

  const handleSelectLevel = (value: string) => {
    setEducationLevel(value);
    setShowLevelSuggestions(false);
  };

  const handleAcademicResultChange = (text: string) => {
    let cleaned = text.replace(/[^0-9.]/g, "");

    const parts = cleaned.split(".");
    if (parts.length > 2) {
      cleaned = parts[0] + "." + parts[1];
    }

    setAcademicResult(cleaned);
  };

  const handleAcademicResultEndEditing = () => {
    const trimmed = _academicResult.trim();
    if (!trimmed) {
      setAcademicResult("");
      return;
    }

    const num = parseFloat(trimmed);
    if (isNaN(num)) {
      setAcademicResult("");
      return;
    }

    if (num > 4) {
      Alert.alert("Validation", "CGPA cannot be more than 4.00.");
      setAcademicResult("4.00");
      return;
    }

    if (num < 0) {
      Alert.alert("Validation", "CGPA cannot be negative.");
      setAcademicResult("0.00");
      return;
    }
    setAcademicResult(num.toFixed(2));
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
          <TouchableWithoutFeedback
            onPress={() => {
              setShowFieldSuggestions(false);
              setShowLevelSuggestions(false);
              setShowUniversitySuggestions(false);
            }}
          >
            <View style={styles.container}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => router.replace("/(job-seekerTabs)/profile")}
              >
                <Ionicons name="arrow-back" size={24} color="black" />
              </TouchableOpacity>
              <ScrollView keyboardShouldPersistTaps="handled">
                <View style={styles.box}>
                  <Text style={styles.boxTitle}>Highest education</Text>

                  <Text style={styles.label}>University:</Text>
                  <View style={{ position: "relative" }}>
                    <TextInput
                      style={styles._textInput}
                      placeholder="Enter your university name"
                      value={_university}
                      onChangeText={handleUniversityChange}
                      onFocus={() => {
                        setShowFieldSuggestions(false);
                        setShowLevelSuggestions(false);
                        if (!_university.trim()) {
                          const initial = (universities as string[]).slice(
                            0,
                            20
                          );
                          setUniversitySuggestions(initial);
                          setShowUniversitySuggestions(true);
                        }
                      }}
                    />

                    {showUniversitySuggestions &&
                      universitySuggestions.length > 0 && (
                        <View
                          style={[
                            styles.suggestionBox,
                            styles.universitySuggestionBox,
                          ]}
                        >
                          <ScrollView
                            keyboardShouldPersistTaps="handled"
                            nestedScrollEnabled={true}
                          >
                            {universitySuggestions.map((item) => (
                              <TouchableOpacity
                                key={item}
                                onPress={() => handleSelectUniversity(item)}
                              >
                                <Text style={styles.suggestion}>{item}</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                      )}
                  </View>

                  <Text style={styles.label}>Education Level:</Text>
                  <View style={{ position: "relative" }}>
                    <TextInput
                      style={styles._textInput}
                      placeholder="Enter your education level"
                      value={_educationLevel}
                      onChangeText={handleLevelChange}
                      onFocus={() => {
                        setShowFieldSuggestions(false);
                        setShowUniversitySuggestions(false);
                        if (EDUCATION_LEVEL_OPTIONS.length > 0) {
                          setLevelSuggestions(EDUCATION_LEVEL_OPTIONS);
                          setShowLevelSuggestions(true);
                        }
                      }}
                    />
                    {showLevelSuggestions && levelSuggestions.length > 0 && (
                      <View style={styles.suggestionBox}>
                        <ScrollView
                          keyboardShouldPersistTaps="handled"
                          nestedScrollEnabled={true}
                        >
                          {levelSuggestions.map((item) => (
                            <TouchableOpacity
                              key={item}
                              onPress={() => handleSelectLevel(item)}
                            >
                              <Text style={styles.suggestion}>{item}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>

                  <Text style={styles.label}>Field of study:</Text>
                  <View style={{ position: "relative" }}>
                    <TextInput
                      style={styles._textInput}
                      placeholder="Enter your field of study"
                      value={_fieldOfStudy}
                      onChangeText={handleFieldChange}
                      onFocus={() => {
                        setShowFieldSuggestions(false);
                        setShowUniversitySuggestions(false);
                        if (FIELD_OF_STUDY_OPTIONS.length > 0) {
                          setFieldSuggestions(FIELD_OF_STUDY_OPTIONS);
                          setShowFieldSuggestions(true);
                        }
                      }}
                    />

                    {showFieldSuggestions && fieldSuggestions.length > 0 && (
                      <View
                        className="suggestionBox"
                        style={styles.suggestionBox}
                      >
                        <ScrollView
                          keyboardShouldPersistTaps="handled"
                          nestedScrollEnabled={true}
                        >
                          {fieldSuggestions.map((item) => (
                            <TouchableOpacity
                              key={item}
                              onPress={() => handleSelectField(item)}
                            >
                              <Text style={styles.suggestion}>{item}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>

                  <Text style={styles.label}>Academic Result:</Text>
                  <View style={{ position: "relative" }}>
                    <TextInput
                      style={styles._textInput}
                      placeholder="e.g. 3.26"
                      keyboardType="decimal-pad"
                      value={_academicResult}
                      onChangeText={handleAcademicResultChange}
                      onBlur={handleAcademicResultEndEditing}
                    />
                  </View>

                  <TouchableOpacity
                    style={styles.btnNext}
                    onPress={handleAddEducation}
                    disabled={loading}
                  >
                    <Text style={styles.btnText}>
                      {loading ? "Saving..." : educationId ? "Update" : "Save"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backBtn: {
    position: "absolute",
    top: 40,
    left: 20,
    padding: 8,
    zIndex: 10,
  },

  container: {
    padding: 24,
    flex: 1,
  },
  boxTitle: {
    color: "#446cffff",
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 6,
    paddingBottom: 10,
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
    marginTop: 80,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1B457C",
    marginTop: 10,
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
    backgroundColor: "#fff",
  },
  suggestionBox: {
    position: "absolute",
    top: 55,
    width: "100%",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    zIndex: 10,
    maxHeight: 160,
    elevation: 6,
  },

  universitySuggestionBox: {
    top: 55,
  },

  suggestion: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
});
