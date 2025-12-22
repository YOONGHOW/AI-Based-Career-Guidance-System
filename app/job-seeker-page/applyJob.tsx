import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db, storage } from "../../firebaseConfig";

// ---- Types (lightweight) ----
type Education = {
  university?: string;
  education_level?: string;
  field_of_study?: string;
  academic_result?: string;
};

type CareerProfile = {
  skills?: string[];
};

type CareerHistoryItem = {
  company: string;
  position: string;
  startDate: string;
  endDate: string;
};

type LanguageDoc = {
  language_1?: string;
  language_2?: string;
  language_3?: string;
};

type JobDoc = {
  job_id: string;
  job_name: string;
  company_name: string;
  job_location?: string;
  job_type?: string;
  job_salary?: string;
};

type ResumeChoice = "existing" | "new";

export default function ApplyJobPage() {
  const router = useRouter();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [job, setJob] = useState<JobDoc | null>(null);

  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);

  const [education, setEducation] = useState<Education | null>(null);
  const [skillProfile, setSkillProfile] = useState<CareerProfile | null>(null);
  const [language, setLanguage] = useState<LanguageDoc | null>(null);
  const [history, setHistory] = useState<CareerHistoryItem[]>([]);

  const [resumeChoice, setResumeChoice] = useState<ResumeChoice>("existing");
  const [newResumeUrl, setNewResumeUrl] = useState<string | null>(null);
  const [newResumeFileName, setNewResumeFileName] = useState<string | null>(
    null
  );

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
    const loadData = async () => {
      try {
        setLoading(true);

        const currentUser = auth.currentUser;
        if (!currentUser) {
          Alert.alert("Error", "User not logged in");
          router.back();
          return;
        }

        if (!jobId) {
          Alert.alert("Error", "Job ID is missing.");
          router.back();
          return;
        }

        const jobRef = doc(db, "job", jobId);
        const jobSnap = await getDoc(jobRef);
        if (!jobSnap.exists()) {
          Alert.alert("Error", "Job not found.");
          router.back();
          return;
        }
        const jobData = jobSnap.data();
        setJob({
          job_id: jobSnap.id,
          job_name: jobData.job_name,
          company_name: jobData.company_name,
          job_location: jobData.job_location,
          job_type: jobData.job_type,
          job_salary: jobData.job_salary,
        });

        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          Alert.alert("Error", "User profile not found.");
          router.back();
          return;
        }

        const userData = userSnap.data();
        setUserName(userData.username || "User");
        setUserEmail(userData.email || currentUser.email || "");

        setResumeUrl(userData.resumeUrl || null);
        setResumeFileName(userData.resumeFileName || null);
        if (!userData.resumeUrl) {
          setResumeChoice("new");
        }
        // 3) Load education
        if (userData.educationId) {
          const eduRef = doc(db, "education", userData.educationId);
          const eduSnap = await getDoc(eduRef);
          if (eduSnap.exists()) {
            setEducation(eduSnap.data() as Education);
          }
        }

        // 4) Load skill profile
        if (userData.profile_ids) {
          const profileRef = doc(db, "skillProfile", userData.profile_ids);
          const profileSnap = await getDoc(profileRef);
          if (profileSnap.exists()) {
            setSkillProfile(profileSnap.data() as CareerProfile);
          }
        }

        // 5) Load language doc
        if (userData.language_id) {
          const languageRef = doc(db, "language", userData.language_id);
          const languageSnap = await getDoc(languageRef);
          if (languageSnap.exists()) {
            setLanguage(languageSnap.data() as LanguageDoc);
          }
        }

        // 6) Load career history
        if (userData.careerHistory_id) {
          const careerHistoryRef = doc(
            db,
            "career_history",
            userData.careerHistory_id
          );
          const careerHistorySnap = await getDoc(careerHistoryRef);
          if (careerHistorySnap.exists()) {
            const careers = careerHistorySnap.data().careers || [];
            setHistory(careers);
          }
        }
      } catch (err) {
        console.error("Error loading apply job data:", err);
        Alert.alert("Error", "Failed to load data.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [jobId]);

  const handleUploadNewResume = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        Alert.alert("Error", "User not logged in");
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset || !asset.uri) {
        Alert.alert("Error", "Unable to get selected file.");
        return;
      }

      if (asset.size && asset.size > 10 * 1024 * 1024) {
        Alert.alert("Error", "File size must be less than 10MB.");
        return;
      }

      const response = await fetch(asset.uri);
      const blob = await response.blob();

      const fileRef = ref(
        storage,
        `users/${currentUser.uid}/applications/${asset.name || "resume.pdf"}`
      );

      await uploadBytes(fileRef, blob);
      const downloadUrl = await getDownloadURL(fileRef);

      setNewResumeUrl(downloadUrl);
      setNewResumeFileName(asset.name || "resume.pdf");

      Alert.alert("Success", "Resume uploaded for this application.");
    } catch (err: any) {
      console.error("Error uploading resume:", err);
      Alert.alert(
        "Error",
        err?.code ? `Upload failed: ${err.code}` : "Failed to upload resume."
      );
    }
  };

  const handleOpenExistingResume = async () => {
    const url = resumeChoice === "new" ? newResumeUrl : resumeUrl;

    if (!url) return;

    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (err) {
      console.error("Error opening resume:", err);
      Alert.alert("Error", "Unable to open resume.");
    }
  };

  const handleSubmitApplication = async () => {
    try {
      if (!job || !jobId) {
        Alert.alert("Error", "Job information missing.");
        return;
      }

      const currentUser = auth.currentUser;
      if (!currentUser) {
        Alert.alert("Error", "User not logged in");
        return;
      }

      let chosenUrl: string | null = null;
      let chosenName: string | null = null;

      if (resumeChoice === "existing") {
        chosenUrl = resumeUrl;
        chosenName = resumeFileName;
      } else {
        chosenUrl = newResumeUrl;
        chosenName = newResumeFileName;
      }

      if (!chosenUrl) {
        Alert.alert(
          "Resume Required",
          "Please upload a resume or use your existing resume before applying."
        );
        return;
      }

      setSubmitting(true);

      const applicationsRef = collection(db, "job_applications");
      await addDoc(applicationsRef, {
        userId: currentUser.uid,
        jobId: job.job_id,
        jobTitle: job.job_name,
        companyName: job.company_name,
        jobLocation: job.job_location || null,
        jobType: job.job_type || null,
        jobSalary: job.job_salary || null,
        // resume used for this application
        resumeUrl: chosenUrl,
        resumeFileName: chosenName,
        // snapshot of basic profile
        applicantName: userName,
        applicantEmail: userEmail,
        educationSnapshot: education || null,
        skillSnapshot: skillProfile || null,
        languageSnapshot: language || null,
        careerHistorySnapshot: history || [],
        status: "submitted",
        createdAt: serverTimestamp(),
      });

      const userRef = doc(db, "users", currentUser.uid);
      await updateDoc(userRef, {
        jobApplied_id: arrayUnion(job.job_id),
      });

      Alert.alert("Success", "Your application has been submitted.", [
        {
          text: "OK",
          onPress: () => {
            router.back();
          },
        },
      ]);
    } catch (err) {
      console.error("Error submitting application:", err);
      Alert.alert("Error", "Failed to submit application.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4a60c0ff" />
        <Text>Loading application form...</Text>
      </View>
    );
  }

  const hasExistingResume = !!resumeUrl;

  if (!job) {
    return (
      <View style={styles.center}>
        <Text style={{ color: "red" }}>Job not found.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#d9efffff" }}>
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="black" />
        </TouchableOpacity>

        <View style={styles.box}>
          <Text style={styles.title}>Job Application</Text>
          <View style={styles.divider} />
          <View style={styles.sectionHeader}></View>
          <View style={styles.jobSummary}>
            <Text style={styles.jobTitle}>{job.job_name}</Text>
            <Text style={styles.companyName}>{job.company_name}</Text>
            <Text style={styles.jobMeta}>
              <Ionicons name="location" size={16} /> {job.job_location || "-"}
            </Text>
            <Text style={styles.jobMeta}>
              <Ionicons name="time" size={16} /> {job.job_type || "-"}
            </Text>
          </View>
          <View style={styles.divider} />

          {/* Resume choice */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Resume</Text>
          </View>

          <TouchableOpacity
            style={[
              styles.optionRow,
              resumeChoice === "existing" &&
                hasExistingResume &&
                styles.optionRowSelected,
              !hasExistingResume && styles.optionRowDisabled, // grey background
            ]}
            onPress={() => {
              if (hasExistingResume) {
                setResumeChoice("existing");
              }
            }}
            disabled={!hasExistingResume} // really disabled
          >
            <View
              style={[
                styles.radioOuter,
                !hasExistingResume && styles.radioOuterDisabled, // grey border
              ]}
            >
              {resumeChoice === "existing" && hasExistingResume && (
                <View style={styles.radioInner} />
              )}
            </View>

            <View style={{ flex: 1 }}>
              <Text
                style={
                  hasExistingResume
                    ? styles.optionTitle
                    : styles.optionTitleDisabled
                }
              >
                Use existing resume
              </Text>

              {hasExistingResume ? (
                <Text style={styles.optionSubtitle}>
                  {resumeFileName || "Existing resume"} (tap below to view)
                </Text>
              ) : (
                <Text style={styles.optionSubtitleDisabled}>
                  No resume saved in your profile.
                </Text>
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.optionRow,
              resumeChoice === "new" && styles.optionRowSelected,
            ]}
            onPress={() => setResumeChoice("new")}
          >
            <View style={styles.radioOuter}>
              {resumeChoice === "new" && <View style={styles.radioInner} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.optionTitle}>Upload a new resume</Text>
              {newResumeUrl ? (
                <Text style={styles.optionSubtitle}>
                  {newResumeFileName || "Uploaded resume"} (tap below to view)
                </Text>
              ) : (
                <Text style={styles.optionSubtitle}>
                  Choose a PDF file from your device.
                </Text>
              )}
            </View>
          </TouchableOpacity>

          <View style={styles.resumeActionsRow}>
            {resumeChoice === "new" && (
              <TouchableOpacity
                style={styles.smallButton}
                onPress={handleUploadNewResume}
              >
                <Ionicons
                  name="cloud-upload-outline"
                  size={18}
                  color="#4a60c0ff"
                />
                <Text style={styles.smallButtonText}>Upload PDF</Text>
              </TouchableOpacity>
            )}
            {((resumeChoice === "existing" && resumeUrl) ||
              (resumeChoice === "new" && newResumeUrl)) && (
              <TouchableOpacity
                style={styles.smallButton}
                onPress={handleOpenExistingResume}
              >
                <Ionicons
                  name="document-text-outline"
                  size={18}
                  color="#4a60c0ff"
                />
                <Text style={styles.smallButtonText}>View Resume</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.divider} />

          {/* Profile preview */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Profile Preview</Text>
          </View>

          {/* Basic info */}
          <View style={styles.profileBlock}>
            <Text style={styles.profileLabel}>Name</Text>
            <Text style={styles.profileValue}>{userName}</Text>

            <Text style={styles.profileLabel}>Email</Text>
            <Text style={styles.profileValue}>{userEmail}</Text>
          </View>

          {/* Education */}
          <View style={styles.profileBlock}>
            <Text style={styles.subsectionTitle}>Education</Text>
            {education ? (
              <>
                <Text style={styles.profileValue}>
                  {education.education_level} in {education.field_of_study}
                </Text>
                <Text style={styles.profileValue}>{education.university}</Text>
                {education.academic_result ? (
                  <Text style={styles.profileValue}>
                    CGPA {education.academic_result}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.placeholderText}>
                No education information found.
              </Text>
            )}
          </View>

          {/* Skills */}
          <View style={styles.profileBlock}>
            <Text style={styles.subsectionTitle}>Skills</Text>
            <View style={styles.skillContainer}>
              {!skillProfile ||
              !skillProfile.skills ||
              skillProfile.skills.length === 0 ? (
                <Text style={styles.placeholderText}>No skills found.</Text>
              ) : (
                skillProfile.skills.map((s, index) => (
                  <View style={styles.skillChip} key={index}>
                    <Text style={styles.skillChipText}>{s}</Text>
                  </View>
                ))
              )}
            </View>
          </View>

          {/* Languages */}
          <View style={styles.profileBlock}>
            <Text style={styles.subsectionTitle}>Languages</Text>
            {language ? (
              <View style={styles.languageContainer}>
                {language.language_1 ? (
                  <Text style={styles.languageChip}>{language.language_1}</Text>
                ) : null}
                {language.language_2 ? (
                  <Text style={styles.languageChip}>{language.language_2}</Text>
                ) : null}
                {language.language_3 ? (
                  <Text style={styles.languageChip}>{language.language_3}</Text>
                ) : null}
              </View>
            ) : (
              <Text style={styles.placeholderText}>
                No language information found.
              </Text>
            )}
          </View>

          {/* Career history */}
          <View style={styles.profileBlock}>
            <Text style={styles.subsectionTitle}>Career History</Text>
            {history.length === 0 ? (
              <Text style={styles.placeholderText}>
                No career history found.
              </Text>
            ) : (
              history.map((item, index) => (
                <View key={index} style={styles.careerHistoryBox}>
                  <Text style={styles.careerData}>{item.position}</Text>
                  <Text style={styles.careerCompany}>{item.company}</Text>
                  <Text style={styles.careerDuration}>
                    {item.startDate} - {item.endDate}
                  </Text>
                </View>
              ))
            )}
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitButton, submitting && { opacity: 0.6 }]}
            onPress={handleSubmitApplication}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#1B457C" />
            ) : (
              <Text style={styles.submitButtonText}>Submit Application</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    padding: 16,
    paddingTop: 60,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#d9efffff",
  },
  backBtn: {
    position: "absolute",
    top: 20,
    left: 10,
    padding: 8,
    zIndex: 10,
  },
  box: {
    width: "100%",
    padding: 18,
    borderRadius: 18,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 4,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#003bb1ff",
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#003bb1ff",
  },
  divider: {
    height: 2,
    backgroundColor: "#ccc",
    width: "100%",
    marginVertical: 10,
  },
  jobSummary: {
    marginBottom: 6,
  },
  jobTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#4c73a5ff",
  },
  companyName: {
    fontSize: 16,
    color: "#6b6b6b",
    marginTop: 4,
    marginBottom: 4,
  },
  jobMeta: {
    fontSize: 14,
    color: "#8b8b8b",
    marginTop: 2,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
    marginBottom: 6,
  },
  optionRowSelected: {
    backgroundColor: "#e7eeffff",
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#4a60c0ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    marginTop: 4,
  },
  radioInner: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: "#4a60c0ff",
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1B457C",
  },
  optionSubtitle: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  optionSubtitleDisabled: {
    fontSize: 13,
    color: "#7b7a7aff",
    marginTop: 2,
  },
  resumeActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    gap: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  smallButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#b5caffff",
    backgroundColor: "#f2f4ffff",
  },
  smallButtonText: {
    marginLeft: 6,
    fontSize: 13,
    color: "#4a60c0ff",
    fontWeight: "500",
  },
  profileBlock: {
    marginTop: 6,
    marginBottom: 4,
  },
  profileLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1B457C",
    marginTop: 4,
  },
  profileValue: {
    fontSize: 14,
    color: "#555",
    marginTop: 2,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1B457C",
    marginBottom: 4,
  },
  placeholderText: {
    fontSize: 14,
    color: "#888",
    marginTop: 2,
  },
  skillContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  skillChip: {
    backgroundColor: "#E7EEFF",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
  },
  skillChipText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#1B457C",
  },
  languageContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  languageChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: "#E7EEFF",
    fontSize: 13,
    color: "#1B457C",
  },
  careerHistoryBox: {
    borderWidth: 1,
    borderColor: "#d2e3fbff",
    backgroundColor: "#f5f8ffff",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginTop: 6,
  },
  careerData: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1B457C",
  },
  careerCompany: {
    fontSize: 13,
    color: "#606e81ff",
  },
  careerDuration: {
    fontSize: 13,
    color: "#606e81ff",
  },

  submitButton: {
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: "#7b9ef6ff",
    borderRadius: 25,
    width: "70%",
    alignSelf: "center",
    marginTop: 18,
    backgroundColor: "#e7eeffff",
  },
  submitButtonText: {
    textAlign: "center",
    fontSize: 17,
    fontWeight: "600",
    color: "#1B457C",
  },

  optionRowDisabled: {
    opacity: 0.5,
  },

  radioOuterDisabled: {
    borderColor: "#ccc",
  },

  optionTitleDisabled: {
    fontSize: 15,
    fontWeight: "600",
    color: "#7b7a7aff",
  },
});
