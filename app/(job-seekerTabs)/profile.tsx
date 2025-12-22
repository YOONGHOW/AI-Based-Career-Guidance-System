import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { signOut } from "firebase/auth";
import { doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db, storage } from "../../firebaseConfig";
import { CareerProfile, Education } from "../model/dataType";

type CareerHistoryItem = {
  company: string;
  position: string;
  description?: string;
  startDate: string;
  endDate: string;
};

export const formatReadableDate = (dateStr: string) => {
  if (!dateStr) return "";

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "";

  const day = date.getDate();
  const month = date.toLocaleString("en-US", { month: "long" });
  const year = date.getFullYear();

  return `${day} ${month} ${year}`;
};

export default function Profilepage() {
  const router = useRouter();
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [education, setEducation] = useState<Education | null>(null);
  const [skill, setSkill] = useState<CareerProfile | null>(null);
  const [language, setLanguage] = useState<any>(null);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [history, setHistory] = useState<CareerHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [skillProfileId, setSkillProfileId] = useState<string | null>(null);

  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [showResumeOptions, setShowResumeOptions] = useState(false);
  const [showImageOptions, setShowImageOptions] = useState(false);
  const [showAllSkills, setShowAllSkills] = useState(false);

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
          return;
        }

        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          Alert.alert("User data not found");
          return;
        }

        const userData = userSnap.data();
        setProfileImageUrl(userData.profileImageUrl || null);

        setUserName(userData.username || "User");
        setUserEmail(userData.email || user.email || "");

        setResumeUrl(userData.resumeUrl || null);
        setResumeFileName(userData.resumeFileName || null);

        if (userData.educationId) {
          const eduRef = doc(db, "education", userData.educationId);
          const eduSnap = await getDoc(eduRef);
          if (eduSnap.exists()) {
            setEducation(eduSnap.data() as Education);
          }
        }

        // Skill profile id (can be string or array in your schema)
        if (userData.profile_ids) {
          let profileId: string | null = null;

          if (typeof userData.profile_ids === "string") {
            profileId = userData.profile_ids;
          } else if (
            Array.isArray(userData.profile_ids) &&
            userData.profile_ids.length > 0
          ) {
            profileId = userData.profile_ids[0];
          }

          setSkillProfileId(profileId);
        } else {
          setSkillProfileId(null);
          setSkill(null);
        }

        if (userData.language_id) {
          const languageRef = doc(db, "language", userData.language_id);
          const languageSnap = await getDoc(languageRef);
          if (languageSnap.exists()) {
            setLanguage(languageSnap.data());
          }
        }

        if (userData.careerHistory_id) {
          const careerHistoryRef = doc(
            db,
            "career_history",
            userData.careerHistory_id
          );
          const careerHistorySnap = await getDoc(careerHistoryRef);
          if (careerHistorySnap.exists()) {
            setHistory(careerHistorySnap.data().careers || []);
          }
        }
      } catch (error) {
        console.error(error);
        Alert.alert("Error", "Error fetching profile data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    if (!skillProfileId) return;

    const skillRef = doc(db, "skillProfile", skillProfileId);

    const unsubscribe = onSnapshot(
      skillRef,
      (snap) => {
        if (snap.exists()) {
          setSkill(snap.data() as CareerProfile);
        } else {
          setSkill(null);
        }
      },
      (error) => {
        console.error("Skill snapshot error:", error);
      }
    );

    return () => unsubscribe();
  }, [skillProfileId]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4a60c0ff" />
        <Text>Loading profile data...</Text>
      </View>
    );
  }

  const uploadProfileImage = async (uri: string) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        Alert.alert("Error", "User not logged in");
        return;
      }

      setUploadingImage(true);

      const response = await fetch(uri);
      const blob = await response.blob();
      const fileRef = ref(storage, `users/${currentUser.uid}/profile.jpg`);

      await uploadBytes(fileRef, blob);
      const downloadUrl = await getDownloadURL(fileRef);

      const userRef = doc(db, "users", currentUser.uid);
      await updateDoc(userRef, {
        profileImageUrl: downloadUrl,
      });

      setProfileImageUrl(downloadUrl);
      Alert.alert("Success", "Profile image updated!");
    } catch (err: any) {
      console.error("Error updating profile image:", err);
      Alert.alert(
        "Error",
        err?.code
          ? `Upload failed: ${err.code}`
          : "Failed to update profile image."
      );
    } finally {
      setUploadingImage(false);
    }
  };

  const handleOpenImageOptions = () => {
    setShowImageOptions(true);
  };

  const handleCloseImageOptions = () => {
    setShowImageOptions(false);
  };

  const handlePickFromGallery = async () => {
    try {
      setShowImageOptions(false);

      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission required",
          "Please allow access to your photos to upload a profile picture."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        allowsEditing: true,
        aspect: [1, 1],
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset || !asset.uri) {
        Alert.alert("Error", "Unable to get selected image.");
        return;
      }

      await uploadProfileImage(asset.uri);
    } catch (err) {
      console.error("Gallery pick error:", err);
      Alert.alert("Error", "Failed to pick image from gallery.");
    }
  };

  const handleTakePhoto = async () => {
    try {
      setShowImageOptions(false);

      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission required",
          "Please allow camera access to take a photo."
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.7,
        allowsEditing: true,
        aspect: [1, 1],
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset || !asset.uri) {
        Alert.alert("Error", "Unable to get captured image.");
        return;
      }

      await uploadProfileImage(asset.uri);
    } catch (err) {
      console.error("Camera error:", err);
      Alert.alert("Error", "Failed to take photo.");
    }
  };

  const handleUploadFile = async () => {
    try {
      setShowResumeOptions(false);
      setUploadingResume(true); // 🔹 start loading

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

      if (result.canceled) {
        return;
      }

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
        `users/${currentUser.uid}/documents/${asset.name || "resume.pdf"}`
      );

      await uploadBytes(fileRef, blob);
      const downloadUrl = await getDownloadURL(fileRef);

      const userRef = doc(db, "users", currentUser.uid);
      await updateDoc(userRef, {
        resumeUrl: downloadUrl,
        resumeFileName: asset.name || "resume.pdf",
      });

      setResumeUrl(downloadUrl);
      setResumeFileName(asset.name || "resume.pdf");

      Alert.alert("Success", "File uploaded successfully!");
    } catch (err: any) {
      console.error("Error uploading file:", err);
      Alert.alert(
        "Error",
        err?.code ? `Upload failed: ${err.code}` : "Failed to upload file."
      );
    } finally {
      setUploadingResume(false); // 🔹 stop loading
    }
  };

  const handleOpenResume = async () => {
    if (!resumeUrl) return;
    try {
      await WebBrowser.openBrowserAsync(resumeUrl);
    } catch (e) {
      console.log("Error opening resume:", e);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      Alert.alert("Logged out successfully");
      router.replace("/");
    } catch {
      Alert.alert("Logout failed");
    }
  };

  const handleOpenResumeOptions = () => {
    setShowResumeOptions(true);
  };

  const handleCloseResumeOptions = () => {
    setShowResumeOptions(false);
  };

  const handleAutoGenerateResume = () => {
    setShowResumeOptions(false);
    router.push("/job-seeker-page/autoGenerateResume");
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#d9efffff", paddingTop: 50 }}>
      <KeyboardAvoidingView>
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Profile</Text>
          </View>

          <View style={styles.profileImageWrapper}>
            <Image
              source={
                profileImageUrl
                  ? { uri: profileImageUrl }
                  : require("../../assets/images/user.png")
              }
              style={styles.headerImg}
            />

            <TouchableOpacity
              style={styles.editImageBtn}
              onPress={handleOpenImageOptions}
              disabled={uploadingImage}
            >
              {uploadingImage ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="pencil" size={16} color="#fff" />
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.profileName}>{userName}</Text>

          <View style={styles.box}>
            {/* ================= Resume Section ================= */}
            <View style={styles.FirstsubHeaderContainer}>
              <Text style={styles.subheader}>Resume</Text>

              {uploadingResume ? (
                <ActivityIndicator
                  size="small"
                  color="#1B457C"
                  style={styles.resumeLoading}
                />
              ) : (
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={handleOpenResumeOptions}
                >
                  <Ionicons name="pencil" size={21} color="black" />
                </TouchableOpacity>
              )}
            </View>

            <View
              style={{
                height: 2,
                backgroundColor: "#ccc",
                width: "100%",
                marginVertical: 12,
              }}
            />

            {!resumeUrl ? (
              <Text
                style={{ color: "#999", fontSize: 16, textAlign: "center" }}
              >
                No resume uploaded yet. Tap the icon to add your resume (PDF).
              </Text>
            ) : (
              <TouchableOpacity
                style={styles.resumeRow}
                onPress={handleOpenResume}
              >
                <Ionicons
                  name="document-text-outline"
                  size={22}
                  color="#4a5fd4ff"
                  style={{ marginRight: 8 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.resumeFileName} numberOfLines={1}>
                    {resumeFileName || "Resume.pdf"}
                  </Text>
                  <Text style={styles.resumeHint}>Tap to view in browser</Text>
                </View>
                <Ionicons name="open-outline" size={18} color="#4a5fd4ff" />
              </TouchableOpacity>
            )}

            {/* ================= Education Section ================= */}
            <View style={styles.subHeaderContainer}>
              <Text style={styles.subheader}>Education</Text>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => router.push("/job-seeker-page/editEducation")}
              >
                <Ionicons name="pencil" size={21} color="black" />
              </TouchableOpacity>
            </View>
            <View
              style={{
                height: 2,
                backgroundColor: "#ccc",
                width: "100%",
                marginVertical: 12,
              }}
            />
            {education ? (
              <View style={styles.careerHistoryBox}>
                <Text style={styles.universityName}>
                  {education?.university}
                </Text>

                <Text style={styles.profileData}>
                  {education?.education_level} in {education?.field_of_study}
                </Text>
                <Text style={styles.profileData}>
                  CGPA {education?.academic_result}
                </Text>
              </View>
            ) : (
              <Text
                style={{ color: "#666", textAlign: "center", fontSize: 16 }}
              >
                No education background found.
              </Text>
            )}

            {/* ================= Skill Profile Section ================= */}
            <View style={styles.subHeaderContainer}>
              <Text style={styles.subheader}>Skill</Text>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() =>
                  router.push("/job-seeker-page/editCareerProfile")
                }
              >
                <Ionicons name="pencil" size={21} color="black" />
              </TouchableOpacity>
            </View>
            <View
              style={{
                height: 2,
                backgroundColor: "#ccc",
                width: "100%",
                marginVertical: 12,
              }}
            />

            <View style={styles.skillContainer}>
              {!skill || !skill.skills || skill.skills.length === 0 ? (
                <Text
                  style={{
                    color: "#666",
                    textAlign: "center",
                    fontSize: 16,
                  }}
                >
                  No skills found.
                </Text>
              ) : (
                <>
                  {(showAllSkills
                    ? skill.skills
                    : skill.skills.slice(0, 5)
                  ).map((s, index) => (
                    <View style={styles.skillChip} key={index}>
                      <Text style={styles.skillChipText}>{s}</Text>
                    </View>
                  ))}

                  {skill.skills.length > 5 && (
                    <TouchableOpacity
                      style={styles.viewMoreChip}
                      onPress={() => setShowAllSkills((prev) => !prev)}
                    >
                      <Text style={styles.viewMoreText}>
                        {showAllSkills
                          ? "View less"
                          : `View more (${skill.skills.length - 5})`}
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>

            {/* ================= Career History Section ================= */}
            <View style={styles.subHeaderContainer}>
              <Text style={styles.subheader}>Career History</Text>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() =>
                  router.replace("/job-seeker-page/editCareerHistory")
                }
              >
                <Ionicons name="pencil" size={21} color="black" />
              </TouchableOpacity>
            </View>
            <View
              style={{
                height: 2,
                backgroundColor: "#ccc",
                width: "100%",
                marginVertical: 12,
              }}
            />
            <View style={styles.careerHisotryContainer}>
              {history.length === 0 ? (
                <Text
                  style={{ color: "#666", textAlign: "center", fontSize: 16 }}
                >
                  No career history found.
                </Text>
              ) : (
                history.map((item, index) => (
                  <View key={index} style={styles.careerHistoryBox}>
                    <Text style={styles.careerData}>{item.position}</Text>
                    <Text style={styles.cmpName}>{item.company}</Text>
                    <Text style={styles.duration}>
                      Start: {formatReadableDate(item.startDate)}
                    </Text>
                    <Text style={styles.duration}>
                      End: {formatReadableDate(item.endDate)}
                    </Text>
                  </View>
                ))
              )}
            </View>

            {/* ================= Language Section ================= */}
            <View style={styles.subHeaderContainer}>
              <Text style={styles.subheader}>Languages</Text>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => router.replace("/job-seeker-page/editLanguage")}
              >
                <Ionicons name="pencil" size={21} color="black" />
              </TouchableOpacity>
            </View>
            <View
              style={{
                height: 2,
                backgroundColor: "#ccc",
                width: "100%",
                marginVertical: 12,
              }}
            />
            <View style={styles.languageContainer}>
              {language ? (
                <>
                  {language.language_1 ? (
                    <Text style={styles.language}>{language.language_1}</Text>
                  ) : null}
                  {language.language_2 ? (
                    <Text style={styles.language}>{language.language_2}</Text>
                  ) : null}
                  {language.language_3 ? (
                    <Text style={styles.language}>{language.language_3}</Text>
                  ) : null}
                </>
              ) : (
                <Text
                  style={{ color: "#666", textAlign: "center", fontSize: 16 }}
                >
                  No languages found.
                </Text>
              )}
            </View>
          </View>

          <TouchableOpacity style={styles.btnLogout} onPress={handleLogout}>
            <Text style={styles.btnText}>Sign out</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 🔸 Resume bottom sheet */}
      {showResumeOptions && (
        <View style={styles.bottomSheetOverlay}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={handleCloseResumeOptions}
          />
          <View style={styles.bottomSheet}>
            <TouchableOpacity
              style={styles.bottomSheetOption}
              onPress={handleUploadFile}
            >
              <Ionicons
                name="cloud-upload-outline"
                size={22}
                color="#1B457C"
                style={{ marginRight: 10 }}
              />
              <Text style={styles.bottomSheetOptionText}>
                Upload from device
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bottomSheetOption}
              onPress={handleAutoGenerateResume}
            >
              <Ionicons
                name="bulb-outline"
                size={22}
                color="#1B457C"
                style={{ marginRight: 10 }}
              />
              <Text style={styles.bottomSheetOptionText}>
                Auto-generate resume
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 🔹 NEW: Image bottom sheet */}
      {showImageOptions && (
        <View style={styles.bottomSheetOverlay}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={handleCloseImageOptions}
          />
          <View style={styles.bottomSheet}>
            <TouchableOpacity
              style={styles.bottomSheetOption}
              onPress={handlePickFromGallery}
            >
              <Ionicons
                name="images-outline"
                size={22}
                color="#1B457C"
                style={{ marginRight: 10 }}
              />
              <Text style={styles.bottomSheetOptionText}>
                Choose from gallery
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bottomSheetOption}
              onPress={handleTakePhoto}
            >
              <Ionicons
                name="camera-outline"
                size={22}
                color="#1B457C"
                style={{ marginRight: 10 }}
              />
              <Text style={styles.bottomSheetOptionText}>Take a photo</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 40,
  },

  header: {
    marginVertical: 30,
    marginTop: 10,
  },

  headerTitle: {
    color: "#8c92aaff",
    fontSize: 25,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 6,
  },

  profileImageWrapper: {
    alignSelf: "center",
  },

  editImageBtn: {
    position: "absolute",
    bottom: 32,
    right: 0,
    backgroundColor: "#6c81daff",
    width: 30,
    height: 30,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },

  headerImg: {
    height: 100,
    width: 100,
    alignSelf: "center",
    marginBottom: 36,
    borderRadius: 100,
    marginTop: -5,
  },

  profileName: {
    textAlign: "center",
    marginTop: -25,
    marginBottom: 10,
    fontSize: 22,
    fontWeight: "bold",
    color: "#656e9eff",
  },

  box: {
    width: "100%",
    padding: 25,
    borderRadius: 30,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 4,
    marginTop: 20,
  },

  FirstsubHeaderContainer: {
    marginTop: 10,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },

  subHeaderContainer: {
    marginTop: 30,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },

  subheader: {
    fontSize: 21,
    fontWeight: "bold",
    color: "#003bb1ff",
  },

  editBtn: {
    position: "absolute",
    right: 0,
    top: "50%",
    transform: [{ translateY: -10 }],
    paddingHorizontal: 10,
  },

  label: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1B457C",
    marginTop: 10,
  },

  profileData: {
    fontSize: 18,
    fontWeight: "500",
    color: "#868686ff",
    marginTop: 10,
  },

  universityName: {
    padding: 1,
    fontSize: 18,
    fontWeight: "600",
    color: "#1B457C",
  },

  resumeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#f5f8ffff",
    borderWidth: 1,
    borderColor: "#c4d1ffff",
    marginTop: 4,
  },
  resumeFileName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1B457C",
  },
  resumeHint: {
    fontSize: 12,
    color: "#6b6b6b",
    marginTop: 2,
  },

  skillContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 10,
  },

  skillChip: {
    backgroundColor: "#f5f8ffff",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#d2e3fbff",
  },

  skillChipText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#07499fff",
    lineHeight: 20,
  },

  // Career History
  careerHisotryContainer: {
    flexDirection: "column",
    gap: 15,
    marginTop: 10,
  },

  careerHistoryBox: {
    borderWidth: 2,
    backgroundColor: "#f5f8ffff",
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 20,
    borderColor: "#d2e3fbff",
  },

  careerData: {
    padding: 1,
    fontSize: 18,
    fontWeight: "500",
    color: "#1B457C",
  },

  cmpName: {
    padding: 1,
    fontSize: 15,
    fontWeight: "500",
    color: "#606e81ff",
  },

  duration: {
    padding: 1,
    fontSize: 15,
    fontWeight: "500",
    color: "#606e81ff",
  },

  // Language
  languageContainer: {
    flexDirection: "column",
    gap: 10,
    marginTop: 10,
  },

  language: {
    padding: 1,
    fontSize: 18,
    fontWeight: "500",
    color: "#1B457C",
    backgroundColor: "#f5f8ffff",
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 20,
    borderColor: "#d2e3fbff",
    borderWidth: 2,
  },

  // Logout button
  btnLogout: {
    padding: 8,
    borderWidth: 2,
    borderColor: "#7b9ef6ff",
    borderRadius: 25,
    width: "70%",
    alignSelf: "center",
    marginTop: 35,
    backgroundColor: "#e7eeffff",
  },

  btnText: {
    textAlign: "center",
    fontSize: 20,
    fontWeight: "600",
    color: "#1B457C",
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  bottomSheetOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
    zIndex: 10,
  },

  bottomSheet: {
    backgroundColor: "#fff",
    paddingTop: 14,
    paddingBottom: 14,
    paddingHorizontal: 18,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },

  bottomSheetOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },

  bottomSheetOptionText: {
    fontSize: 16,
    color: "#1B457C",
    fontWeight: "500",
  },

  bottomSheetCancel: {
    marginTop: 10,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#e1e4f0",
  },

  bottomSheetCancelText: {
    fontSize: 16,
    color: "#666",
    fontWeight: "500",
  },
  resumeLoading: {
    position: "absolute",
    right: 0,
    top: "50%",
    transform: [{ translateY: -10 }],
  },

  viewMoreChip: {
    backgroundColor: "#f5f8ffff",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#a6b8faff",
  },

  viewMoreText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1B457C",
  },
});
