import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { collection, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  BackHandler,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import skillOptions from "../../assets/unique_skills.json";
import { auth, db } from "../../firebaseConfig";

export default function SetsCareerProfile() {
  const router = useRouter();

  const [skillInput, setSkillInput] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [showSkillSuggestions, setShowSkillSuggestions] = useState(false);

  const [profileId, setProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const user = auth.currentUser;
  const isUserLoggedIn = !!user;
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
    const loadCareerProfile = async () => {
      try {
        if (!user) return;

        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) return;

        const userData = userSnap.data() || {};
        const profileIds = userData.profile_ids;

        let careerProfileId: string | null = null;

        if (typeof profileIds === "string") {
          careerProfileId = profileIds;
        } else if (Array.isArray(profileIds) && profileIds.length > 0) {
          careerProfileId = profileIds[0];
        }

        if (!careerProfileId) return;

        const profileRef = doc(db, "skillProfile", careerProfileId);
        const profileSnap = await getDoc(profileRef);

        if (profileSnap.exists()) {
          const data = profileSnap.data() as any;
          const skillsFromDb = Array.isArray(data.skills) ? data.skills : [];
          setSelectedSkills(skillsFromDb);
          setProfileId(careerProfileId);
        }
      } catch (err) {
        console.error("Error loading career profile:", err);
      }
    };

    loadCareerProfile();
  }, [user]);

  const filteredSkillSuggestions = useMemo(() => {
    const allSkills = skillOptions as string[];

    if (!skillInput.trim()) return [];

    const lower = skillInput.toLowerCase();

    // Filter first
    const matches = allSkills.filter(
      (s) => s.toLowerCase().includes(lower) && !selectedSkills.includes(s)
    );
    const sorted = matches.sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();

      const aExact = aLower === lower;
      const bExact = bLower === lower;
      if (aExact !== bExact) return aExact ? -1 : 1;

      const aStarts = aLower.startsWith(lower);
      const bStarts = bLower.startsWith(lower);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;

      return aLower.localeCompare(bLower);
    });

    return sorted.slice(0, 10);
  }, [skillInput, selectedSkills]);

  const handleAddSkill = (skillFromSuggestion?: string) => {
    const value = (skillFromSuggestion ?? skillInput).trim();
    if (!value) return;

    if (!selectedSkills.includes(value)) {
      setSelectedSkills((prev) => [...prev, value]);
    }

    setSkillInput("");
    setShowSkillSuggestions(false);
  };

  const handleRemoveSkill = (skill: string) => {
    setSelectedSkills((prev) => prev.filter((s) => s !== skill));
  };

  const handleAddCareer = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        Alert.alert("Error", "User not logged in");
        return;
      }

      if (selectedSkills.length === 0) {
        Alert.alert("Missing Info", "Please add at least one skill.");
        return;
      }

      setLoading(true);

      const userRef = doc(db, "users", currentUser.uid);

      if (profileId) {
        const profileRef = doc(db, "skillProfile", profileId);

        const data = {
          skills: selectedSkills,
          updatedAt: new Date(),
        };

        await updateDoc(profileRef, data);

        Alert.alert("Success", "Career profile updated successfully!");
      } else {
        const newDocRef = doc(collection(db, "skillProfile"));

        const data = {
          id: newDocRef.id,
          userId: currentUser.uid,
          skills: selectedSkills,
          createdAt: new Date(),
        };

        await setDoc(newDocRef, data);

        await updateDoc(userRef, {
          profile_ids: newDocRef.id,
        });

        setProfileId(newDocRef.id);

        Alert.alert("Success", "Career profile added successfully!");
      }

      router.push("/(job-seekerTabs)/profile");
    } catch (error: any) {
      console.error(error);
      Alert.alert("Error saving data", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#d9efffff" }}>
      {!isUserLoggedIn ? (
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <Text>Please log in to set your career profile.</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.container}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => router.push("/(job-seekerTabs)/profile")}
            >
              <Ionicons name="arrow-back" size={24} color="black" />
            </TouchableOpacity>

            <View style={styles.box}>
              <Text style={styles.boxTitle}>Career Profile</Text>

              {/* ---------- SKILLS ---------- */}
              <Text style={styles.label}>Skills:</Text>

              <View style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <TextInput
                    style={[styles._textInput, { flex: 1 }]}
                    placeholder="e.g. Python, Design"
                    value={skillInput}
                    onChangeText={(text) => {
                      setSkillInput(text);
                      setShowSkillSuggestions(true);
                    }}
                  />
                </View>

                {/* 🔹 Skill suggestions dropdown */}
                {showSkillSuggestions &&
                  filteredSkillSuggestions.length > 0 && (
                    <View style={styles.suggestionBox}>
                      <ScrollView keyboardShouldPersistTaps="handled">
                        {filteredSkillSuggestions.map((skill) => (
                          <TouchableOpacity
                            key={skill}
                            onPress={() => handleAddSkill(skill)}
                            style={styles.suggestionItem}
                          >
                            <Text style={styles.suggestionText}>{skill}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                {/* Selected skills as chips */}
                <View style={styles.chipContainer}>
                  {selectedSkills.map((skill) => (
                    <TouchableOpacity
                      key={skill}
                      style={styles.chip}
                      onPress={() => handleRemoveSkill(skill)}
                    >
                      <Text style={styles.chipText}>{skill} ✕</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TouchableOpacity
                style={styles.btnNext}
                onPress={handleAddCareer}
                disabled={loading}
              >
                <Text style={styles.btnText}>
                  {loading ? "Saving" : profileId ? "Update" : "Submit"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backBtn: {
    position: "absolute",
    top: 40,
    left: 20,
    padding: 8,
  },

  container: {
    padding: 24,
    flex: 1,
  },
  header: {
    marginVertical: 30,
    marginTop: 50,
  },
  headerTitle: {
    color: "#8BA0FF",
    fontSize: 25,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 6,
  },
  boxTitle: {
    color: "#446cffff",
    fontSize: 24,
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
    marginTop: "25%",
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1B457C",
    marginTop: 8,
  },
  btnNext: {
    padding: 8,
    borderWidth: 2,
    borderColor: "#7b9ef6ff",
    borderRadius: 30,
    width: "60%",
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
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#7b9ef6ff",
    fontSize: 16,
    paddingHorizontal: 10,
    backgroundColor: "#fff",
  },
  chipContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#7b9ef6ff",
    backgroundColor: "#f3f5ffff",
  },
  chipText: {
    fontSize: 15,
    color: "#1B457C",
  },
  suggestionBox: {
    marginTop: 4,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  suggestionItem: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  suggestionText: {
    fontSize: 14,
    color: "#111827",
  },
});
