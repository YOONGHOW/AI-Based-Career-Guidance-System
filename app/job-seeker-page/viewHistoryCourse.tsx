import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../firebaseConfig";
import { courses } from "../model/dataType";

export default function LearningInformation() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const courseId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [course, setCourse] = useState<courses | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyDocId, setHistoryDocId] = useState<string | null>(null);
  const [skills, setSkills] = useState<string[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [isCompleted, setIsCompleted] = useState(false);
  const [completing, setCompleting] = useState(false);

  const user = auth.currentUser;
  const uid = user ? user.uid : "";

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
    const fetchCourse = async () => {
      try {
        if (!user) {
          Alert.alert("Error", "User not logged in");
          return;
        }
        const courseRef = doc(db, "courses", courseId);
        const courseSnap = await getDoc(courseRef);

        if (courseSnap.exists()) {
          setCourse({
            course_id: courseSnap.id,
            ...courseSnap.data(),
          } as courses);
        }

        const q = query(
          collection(db, "courseHistory"),
          where("course_id", "==", courseId),
          where("userId", "==", uid)
        );
        const regSnap = await getDocs(q);

        if (!regSnap.empty) {
          setHistoryDocId(regSnap.docs[0].id);
        } else {
          console.log("User did not register this course");
        }
        const historyQuery = query(
          collection(db, "courseHistory"),
          where("course_id", "==", courseId),
          where("userId", "==", uid)
        );
        const historySnap = await getDocs(historyQuery);

        if (!historySnap.empty) {
          setIsCompleted(true);
        }

        setLoading(false);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };

    fetchCourse();
  }, [courseId]);

  useEffect(() => {
    const fetchSkills = async () => {
      if (!courseId) {
        setSkillsLoading(false);
        return;
      }

      try {
        const courseRef = doc(db, "courses", courseId as string);
        const courseSnap = await getDoc(courseRef);

        if (courseSnap.exists()) {
          const data = courseSnap.data();

          const skillArray = (data.coursera_skills || []) as string[];
          setSkills(skillArray);
        } else {
          setSkills([]);
        }
      } catch (error) {
        console.error("Error fetching skills:", error);
        setSkills([]);
      } finally {
        setSkillsLoading(false);
      }
    };

    fetchSkills();
  }, [courseId]);

  const deleteHistoryCourse = async () => {
    if (!historyDocId) {
      Alert.alert("Error", "No registered course found to delete");
      return;
    }

    try {
      await deleteDoc(doc(db, "courseHistory", historyDocId));
      await updateDoc(doc(db, "users", uid), {
        courseRegister_list: arrayRemove(courseId),
      });
      Alert.alert("Removed", "Course removed from history successfully");
      router.push("/(job-seekerTabs)/learn");
    } catch (err) {
      console.error("Delete failed:", err);
      Alert.alert("Error", "Unable to delete course");
    }
  };

  const handleOpenCourseLink = () => {
    if (course?.course_link) Linking.openURL(course.course_link);
  };

  if (loading || !course) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007BFF" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#d9efff" }}>
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.box}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="black" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dltbutton}
            onPress={deleteHistoryCourse}
          >
            <Ionicons name="trash" size={24} color="red" />
          </TouchableOpacity>

          <View style={styles.titleContainer}>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/job-seeker-page/providerDetails",
                  params: {
                    providerName: Array.isArray(course.provider_names)
                      ? course.provider_names[0]
                      : course.provider_names,
                  },
                })
              }
              style={{ alignItems: "center" }}
            >
              <Image
                source={
                  course.course_image
                    ? { uri: course.course_image.toString() }
                    : require("../../assets/images/logo.png")
                }
                style={styles.companyLogo}
                resizeMode="contain"
              />
            </TouchableOpacity>

            <Text style={styles.courseTitle}>{course.course_title}</Text>

            <Text style={styles.companyName}>
              {Array.isArray(course.provider_names)
                ? course.provider_names.join(", ")
                : course.provider_names}
            </Text>
          </View>

          <View style={styles.divider} />

          <Text style={styles.subheading}>Course Description:</Text>
          <Text style={styles.cert_description}>
            {course.course_description}
          </Text>
          <View style={styles.divider} />
          <Text style={styles.subheading}>Skills you`ll gain:</Text>

          {skillsLoading ? (
            <View style={{ marginTop: 10 }}>
              <ActivityIndicator size="small" color="#007BFF" />
            </View>
          ) : skills.length > 0 ? (
            <View style={styles.skillChipContainer}>
              {skills.map((skill, index) => (
                <View key={index.toString()} style={styles.skillChip}>
                  <Text style={styles.skillChipText}>{skill}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.noSkillsText}>
              No skills data available for this course.
            </Text>
          )}
          <TouchableOpacity
            style={styles.btnLearn}
            onPress={handleOpenCourseLink}
          >
            <Text style={styles.btnText}>Go to Course</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.btnComplete,
              isCompleted && { backgroundColor: "#c3d4ff" },
            ]}
            disabled={isCompleted || completing}
          >
            <Text style={styles.btnTextComplete}>
              {isCompleted
                ? "Completed"
                : completing
                ? "Completing..."
                : "Complete"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backBtn: {
    position: "absolute",
    top: 40,
    left: 20,
    padding: 8,
  },
  dltbutton: {
    position: "absolute",
    top: 40,
    right: 20,
    padding: 8,
  },
  scrollContainer: {
    marginTop: 50,
    padding: 10,
    paddingBottom: 100,
  },
  box: {
    width: "100%",
    padding: 15,
    borderRadius: 10,
    backgroundColor: "#fff",
    elevation: 4,
  },
  companyLogo: {
    height: 100,
    width: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: "#d0d0d0",
    marginTop: 40,
    resizeMode: "contain",
  },
  titleContainer: { alignItems: "center" },
  courseTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 10,
    textAlign: "center",
  },
  companyName: {
    fontSize: 16,
    color: "#6b6b6b",
    marginTop: 4,
  },
  subheading: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1B457C",
    marginTop: 12,
  },
  cert_description: {
    fontSize: 15,
    color: "#8b8b8b",
    marginTop: 10,
    textAlign: "justify",
  },
  btnLearn: {
    padding: 10,
    borderRadius: 25,
    width: "70%",
    alignSelf: "center",
    marginTop: 20,
    backgroundColor: "#53b4ad",
  },
  btnText: {
    textAlign: "center",
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },
  btnComplete: {
    padding: 10,
    borderRadius: 25,
    width: "70%",
    alignSelf: "center",
    marginTop: 20,
    backgroundColor: "#86b3ffff",
    borderWidth: 1,
    borderColor: "#adb6f9ff",
  },
  btnTextComplete: {
    textAlign: "center",
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },
  divider: {
    height: 2,
    backgroundColor: "#ccc",
    width: "100%",
    marginVertical: 12,
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  skillChipContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
    marginBottom: 8,
  },
  skillChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#e3f2ff",
    marginRight: 8,
    marginBottom: 8,
  },
  skillChipText: {
    fontSize: 13,
    color: "#1B457C",
    fontWeight: "500",
  },
  noSkillsText: {
    marginTop: 8,
    fontSize: 13,
    color: "#8b8b8b",
  },
});
