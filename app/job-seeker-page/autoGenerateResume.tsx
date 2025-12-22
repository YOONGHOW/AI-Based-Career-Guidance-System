import { Ionicons } from "@expo/vector-icons";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import { printToFileAsync } from "expo-print";
import { useRouter } from "expo-router";
import { shareAsync } from "expo-sharing";
import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../firebaseConfig";
import { CareerProfile, Education } from "../model/dataType";

type CareerHistoryItem = {
  company: string;
  position: string;
  description?: string;
  startDate: string;
  endDate: string;
};

type LanguageDoc = {
  language_1?: string;
  language_2?: string;
  language_3?: string;
};

export default function AutoGenerateResume() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [education, setEducation] = useState<Education | null>(null);
  const [skillProfile, setSkillProfile] = useState<CareerProfile | null>(null);
  const [languages, setLanguages] = useState<LanguageDoc | null>(null);
  const [history, setHistory] = useState<CareerHistoryItem[]>([]);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
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
    const fetchData = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          Alert.alert("Error", "User not logged in");
          router.replace("/");
          return;
        }

        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          Alert.alert("Error", "User data not found");
          router.back();
          return;
        }

        const userData = userSnap.data();
        setProfileImageUrl(userData.profileImageUrl || null);
        setUserName(userData.username || "User");
        setUserEmail(userData.email || user.email || "");

        // Education
        if (userData.educationId) {
          const eduRef = doc(db, "education", userData.educationId);
          const eduSnap = await getDoc(eduRef);
          if (eduSnap.exists()) {
            setEducation(eduSnap.data() as Education);
          }
        }

        // Skill profile
        if (userData.profile_ids) {
          const skillRef = doc(db, "skillProfile", userData.profile_ids);
          const skillSnap = await getDoc(skillRef);
          if (skillSnap.exists()) {
            setSkillProfile(skillSnap.data() as CareerProfile);
          }
        }

        // Languages
        if (userData.language_id) {
          const langRef = doc(db, "language", userData.language_id);
          const langSnap = await getDoc(langRef);
          if (langSnap.exists()) {
            setLanguages(langSnap.data() as LanguageDoc);
          }
        }

        // Career history
        if (userData.careerHistory_id) {
          const careerHistoryRef = doc(
            db,
            "career_history",
            userData.careerHistory_id
          );
          const careerHistorySnap = await getDoc(careerHistoryRef);
          if (careerHistorySnap.exists()) {
            const d = careerHistorySnap.data();
            setHistory(d.careers || []);
          }
        }
      } catch (e) {
        console.error(e);
        Alert.alert("Error", "Failed to load data for resume.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  const loadTemplate = async () => {
    const asset = Asset.fromModule(require("../../assets/resume.html"));
    await asset.downloadAsync();

    const path = asset.localUri || asset.uri;
    const htmlString = await FileSystem.readAsStringAsync(path);

    return htmlString;
  };

  const buildResumeHTML = async () => {
    let html = await loadTemplate();

    const eduDegree = education
      ? `${education.education_level || ""}, ${education.field_of_study || ""}`
      : "Not specified";
    const eduInstitute = education?.university || "Not specified";
    const graduationText = education?.academic_result
      ? `CGPA: ${education.academic_result}`
      : "Not specified";

    const languagesArr: string[] = [];
    if (languages?.language_1) languagesArr.push(languages.language_1);
    if (languages?.language_2) languagesArr.push(languages.language_2);
    if (languages?.language_3) languagesArr.push(languages.language_3);
    const languageLine =
      languagesArr.length > 0 ? languagesArr.join(", ") : "Not specified";

    const skillsHTML =
      skillProfile && skillProfile.skills && skillProfile.skills.length > 0
        ? skillProfile.skills
            .map(
              (s) => `
          <li>
            <p class="tags">${s}</p>
          </li>
        `
            )
            .join("")
        : `
        <li><p class="tags">No skills added yet</p></li>
      `;

    const workHTML =
      history && history.length > 0
        ? history
            .map(
              (item) => `
          <li>
            <p class="tags">
              ${item.position} - ${item.company}<br>
              <span>${item.startDate} – ${item.endDate}</span>
            </p>
          </li>
        `
            )
            .join("")
        : `
        <li><p class="tags">No work experience added yet</p></li>
      `;

    const profilePhoto =
      profileImageUrl || "https://via.placeholder.com/80x80.png?text=Photo";

    const safe = (value?: string | null) => value ?? "";

    const replaceAll = (source: string, token: string, value: string) =>
      source.split(token).join(value);

    html = replaceAll(html, "{{NAME}}", safe(userName));
    html = replaceAll(html, "{{EMAIL}}", safe(userEmail));
    html = replaceAll(html, "{{PROFILE_PHOTO}}", safe(profilePhoto));
    html = replaceAll(html, "{{EDU_DEGREE}}", safe(eduDegree));
    html = replaceAll(html, "{{EDU_INSTITUTE}}", safe(eduInstitute));
    html = replaceAll(html, "{{CGPA}}", safe(graduationText));
    html = replaceAll(html, "{{LANGUAGES}}", safe(languageLine));
    html = replaceAll(html, "{{WORK_LIST}}", safe(workHTML));
    html = replaceAll(html, "{{SKILL_LIST}}", safe(skillsHTML));

    return html;
  };

  const handleGeneratePDF = async () => {
    try {
      if (!userName) {
        Alert.alert("Error", "Missing basic user info to generate resume.");
        return;
      }

      const html = await buildResumeHTML();

      const file = await printToFileAsync({
        html,
        base64: false,
      });

      await shareAsync(file.uri, {
        mimeType: "application/pdf",
        dialogTitle: "Share your resume",
      });
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to generate or share resume PDF.");
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4a60c0ff" />
        <Text>Preparing your resume...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#d9efffff", paddingTop: 50 }}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={26} color="black" />
      </TouchableOpacity>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <Text style={styles.headerTitle}>Auto-generated Resume</Text>

        <View style={styles.previewBox}>
          <Text style={styles.subtitle}>Preview (summary)</Text>
          <Text style={styles.previewText}>
            Name: <Text style={styles.bold}>{userName}</Text>
          </Text>
          <Text style={styles.previewText}>Email: {userEmail}</Text>

          {education && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 16 }]}>
                Education
              </Text>
              <Text style={styles.previewText}>
                {education.education_level} in {education.field_of_study}
              </Text>
              <Text style={styles.previewText}>
                {education.university} · CGPA {education.academic_result}
              </Text>
            </>
          )}

          {skillProfile?.skills?.length ? (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 16 }]}>
                Skills
              </Text>
              <Text style={styles.previewText}>
                {skillProfile.skills.join(", ")}
              </Text>
            </>
          ) : null}

          {history.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 16 }]}>
                Recent Experience
              </Text>
              <Text style={styles.previewText}>
                {history[0].position} at {history[0].company}
              </Text>
            </>
          ) : null}
        </View>

        <TouchableOpacity
          style={styles.generateBtn}
          onPress={handleGeneratePDF}
        >
          <Text style={styles.generateBtnText}>Generate PDF Resume</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  backBtn: {
    position: "absolute",
    top: 50,
    left: 20,
    padding: 8,
    zIndex: 10,
  },
  headerTitle: {
    color: "#8c92aaff",
    fontSize: 21,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 20,
    marginTop: "20%",
  },
  previewBox: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#003bb1ff",
    marginBottom: 4,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#003bb1ff",
    marginBottom: 4,
  },
  previewText: {
    fontSize: 15,
    color: "#444",
    marginTop: 2,
  },
  bold: {
    fontWeight: "600",
  },
  generateBtn: {
    marginTop: 24,
    backgroundColor: "#4a60c0ff",
    paddingVertical: 12,
    borderRadius: 25,
    alignItems: "center",
  },
  generateBtnText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
