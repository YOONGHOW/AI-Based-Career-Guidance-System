import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { collection, doc, getDocs, onSnapshot } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../firebaseConfig";
import { courseRegister, courses } from "../model/dataType";

export default function LearningPage() {
  const router = useRouter();

  const [courseRegisterList, setCourseRegisterList] = useState<
    courseRegister[]
  >([]);
  const [courseHistoryList, setCourseHistoryList] = useState<courseRegister[]>(
    []
  );
  const [activeTab, setActiveTab] = useState<"pinned" | "history">("pinned");
  const [loading, setLoading] = useState(true);

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
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    const userRef = doc(db, "users", user.uid);

    const unsubscribeUser = onSnapshot(userRef, async (userSnap) => {
      if (!userSnap.exists()) {
        setCourseRegisterList([]);
        setCourseHistoryList([]);
        setLoading(false);
        return;
      }

      try {
        const userData = userSnap.data();
        const courseIds: string[] = userData.courseRegister_list || [];

        // 🔹 Load all courses once and map by id
        const courseSnap = await getDocs(collection(db, "courses"));
        const courseMap = new Map<string, courses>();
        courseSnap.forEach((doc) =>
          courseMap.set(doc.id, doc.data() as courses)
        );

        const courseRegSnap = await getDocs(collection(db, "courseRegisted"));
        const courseRegs = courseRegSnap.docs
          .filter((doc) => {
            const data = doc.data() as any;
            return (
              data.userId === user.uid && courseIds.includes(data.course_id)
            );
          })
          .map((doc) => {
            const data = doc.data() as any;
            return {
              courseRegister_id: doc.id,
              ...data,
              courseDetails: courseMap.get(data.course_id),
            } as courseRegister;
          });

        const historySnap = await getDocs(collection(db, "courseHistory"));
        const historyRegs = historySnap.docs
          .filter((doc) => {
            const data = doc.data() as any;
            return data.userId === user.uid;
          })
          .map((doc) => {
            const data = doc.data() as any;
            return {
              courseRegister_id: doc.id,
              ...data,
              courseDetails: courseMap.get(data.course_id),
            } as courseRegister;
          })
          .sort((a, b) => {
            const getTimeValue = (val: any) => {
              if (!val) return 0;
              if (typeof val === "string") {
                const d = new Date(val);
                return isNaN(d.getTime()) ? 0 : d.getTime();
              }
              if (val.toDate) return val.toDate().getTime();
              return 0;
            };

            return getTimeValue(b.completedAt) - getTimeValue(a.completedAt);
          });

        setCourseRegisterList(courseRegs);
        setCourseHistoryList(historyRegs);
      } catch (err) {
        console.error("Error loading learning data:", err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribeUser();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#7b9ef6ff" />
        <Text>Loading your learning data...</Text>
      </View>
    );
  }

  const renderCourseList = (list: courseRegister[], emptyText: string) => {
    if (list.length === 0) {
      return (
        <View>
          <Text style={styles.emptyText}>{emptyText}</Text>
          {activeTab === "pinned" && (
            <TouchableOpacity
              style={styles.navButton}
              onPress={() => router.push("/(job-seekerTabs)/courses")}
            >
              <Text style={styles.navButtonText}>
                Add Courses & Certificates
              </Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    const formatDate = (value: any) => {
      if (!value) return "";

      // Firestore Timestamp
      if (value.toDate) {
        const d = value.toDate();
        return d.toLocaleDateString();
      }

      // ISO string / millis / plain date
      const d = new Date(value);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleDateString();
    };

    return list.map((course) => (
      <TouchableOpacity
        key={course.courseRegister_id}
        style={styles.course_box}
        onPress={() =>
          router.push({
            pathname: "../job-seeker-page/viewCourse",
            params: {
              id: course.course_id,
            },
          })
        }
      >
        <View style={styles.textContainer}>
          <Text style={styles.courseTitle}>
            {course.courseDetails?.course_title || course.course_title}
          </Text>
          <Text style={styles.courseProvider}>
            {Array.isArray(course.courseDetails?.provider_names)
              ? course.courseDetails?.provider_names.join(", ")
              : course.courseDetails?.provider_names ||
                (Array.isArray(course.provider_names)
                  ? course.provider_names.join(", ")
                  : course.provider_names)}
          </Text>
          <Text style={styles.achievementType}>Online Free Course</Text>

          {/* 🔹 Completed date for history */}
          {course.completedAt && (
            <Text style={styles.dateText}>
              Completed on: {formatDate(course.completedAt)}
            </Text>
          )}

          <Text style={styles.status}>
            Status:{" "}
            <Text style={styles.statusChange}>
              {course.courseStatus || "Completed"}
            </Text>
          </Text>
        </View>

        {course.courseDetails?.course_image ? (
          <Image
            source={{ uri: course.courseDetails.course_image }}
            style={styles.companyLogo}
          />
        ) : (
          <Image
            source={require("../../assets/images/logo.png")}
            style={styles.companyLogo}
          />
        )}
      </TouchableOpacity>
    ));
  };

  const formatDate = (value: any) => {
    if (!value) return "";

    if (value.toDate) {
      const d = value.toDate();
      return d.toLocaleDateString();
    }

    const d = new Date(value);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString();
  };

  const renderCourseHistoryList = (
    list: courseRegister[],
    emptyText: string
  ) => {
    if (list.length === 0) {
      return (
        <View>
          <Text style={styles.emptyText}>{emptyText}</Text>
          {activeTab === "pinned" && (
            <TouchableOpacity
              style={styles.navButton}
              onPress={() => router.push("/(job-seekerTabs)/courses")}
            >
              <Text style={styles.navButtonText}>
                Add Courses & Certificates
              </Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    return list.map((course) => (
      <TouchableOpacity
        key={course.courseRegister_id}
        style={styles.course_box}
        onPress={() =>
          router.push({
            pathname: "../job-seeker-page/viewHistoryCourse",
            params: {
              id: course.course_id,
            },
          })
        }
      >
        <View style={styles.textContainer}>
          <Text style={styles.courseTitle}>
            {course.courseDetails?.course_title || course.course_title}
          </Text>
          <Text style={styles.courseProvider}>
            {Array.isArray(course.courseDetails?.provider_names)
              ? course.courseDetails?.provider_names.join(", ")
              : course.courseDetails?.provider_names ||
                (Array.isArray(course.provider_names)
                  ? course.provider_names.join(", ")
                  : course.provider_names)}
          </Text>
          <Text style={styles.achievementType}>Online Free Course</Text>

          {/* 🔹 Completed date for history */}
          {course.completedAt && (
            <Text style={styles.dateText}>
              Completed on: {formatDate(course.completedAt)}
            </Text>
          )}

          <Text style={styles.status}>
            Status:{" "}
            <Text style={styles.statusChange}>
              {course.courseStatus || "Completed"}
            </Text>
          </Text>
        </View>

        {course.courseDetails?.course_image ? (
          <Image
            source={{ uri: course.courseDetails.course_image }}
            style={styles.companyLogo}
          />
        ) : (
          <Image
            source={require("../../assets/images/logo.png")}
            style={styles.companyLogo}
          />
        )}
      </TouchableOpacity>
    ));
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#d9efffff" }}>
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Learning Overview</Text>
        </View>

        {/* Top box with mock interview */}
        <View style={styles.box}>
          <Image
            source={require("../../assets/images/avatar.png")}
            style={styles.robotImg}
          />
          <TouchableOpacity
            style={styles.btnNext}
            onPress={() => {
              router.push("/job-seeker-page/interviewScreen");
            }}
          >
            <Ionicons
              name="call"
              size={20}
              color="#a0a0feff"
              style={{ marginRight: 8 }}
            />
            <Text style={styles.btnText}>Start Mock Interview</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push("/job-seeker-page/viewInterviewHistory")}
          >
            <Text style={styles.viewHisBtn}>View interview history</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tabHeaderRow}>
          <Text style={styles.subheader}>Courses & Certificates</Text>
        </View>

        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === "pinned" && styles.tabButtonActive,
            ]}
            onPress={() => setActiveTab("pinned")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "pinned" && styles.tabTextActive,
              ]}
            >
              Pinned
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === "history" && styles.tabButtonActive,
            ]}
            onPress={() => setActiveTab("history")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "history" && styles.tabTextActive,
              ]}
            >
              History
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === "pinned"
          ? renderCourseList(
              courseRegisterList,
              "** No courses & certificates found **"
            )
          : renderCourseHistoryList(
              courseHistoryList,
              "** No completed courses found **"
            )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    marginVertical: 30,
    marginTop: 50,
  },
  headerTitle: {
    color: "#8c92aaff",
    fontSize: 25,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 6,
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
    marginTop: -10,
  },
  robotImg: {
    height: 80,
    width: 80,
    alignSelf: "center",
    marginBottom: 25,
    borderRadius: 50,
    backgroundColor: "#dae4fdff",
    borderWidth: 2,
    borderColor: "#b1c5f8ff",
  },

  navButton: {
    padding: 8,
    borderWidth: 2,
    borderColor: "#7b9ef6ff",
    borderRadius: 20,
    alignSelf: "center",
    backgroundColor: "#ffffffff",
    marginTop: "5%",
  },
  navButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1B457C",
    textAlign: "center",
  },

  btnNext: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e7eeffff",
    paddingVertical: 11,
    borderRadius: 30,
    borderColor: "#a3bcfdff",
    borderWidth: 1,
    marginTop: -15,
  },
  btnText: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    color: "#1B457C",
  },

  viewHisBtn: {
    textAlign: "center",
    color: "#1B457C",
    fontWeight: "500",
    textDecorationLine: "underline",
    marginTop: 10,
  },

  scrollContainer: {
    padding: 15,
    paddingBottom: 100,
  },

  // 🔹 Tabs
  tabHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 18,
    marginBottom: 4,
  },
  subheader: {
    color: "#90a5f9ff",
    fontSize: 19,
    fontWeight: "700",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#e5ebfcff",
    borderRadius: 999,
    padding: 3,
    marginBottom: 8,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  tabButtonActive: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6e7bb0ff",
  },
  tabTextActive: {
    color: "#1B457C",
    fontWeight: "800",
  },

  course_box: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    padding: 15,
    borderRadius: 10,
    backgroundColor: "#fff",
    elevation: 4,
    marginTop: 6,
  },
  companyLogo: {
    height: 65,
    width: 65,
    marginLeft: 20,
    borderRadius: 50,
    resizeMode: "contain",
    borderWidth: 1,
    borderColor: "#b7b7b7ff",
  },
  textContainer: {
    flex: 1,
  },
  courseTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1B457C",
    flexShrink: 1,
    flexWrap: "wrap",
  },
  courseProvider: {
    fontSize: 14,
    color: "#6b6b6b",
    marginTop: 2,
  },
  achievementType: {
    fontSize: 14,
    color: "#8b8b8b",
    marginTop: 1,
  },
  status: {
    fontSize: 16,
    color: "#909192ff",
    marginTop: 15,
    fontWeight: "bold",
  },
  statusChange: {
    fontSize: 15,
    color: "#5c8d66ff",
    fontWeight: "bold",
  },
  emptyText: {
    textAlign: "center",
    color: "#888",
    marginTop: 10,
    fontSize: 16,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  dateText: {
    fontSize: 13,
    color: "#6f7ca8ff",
    marginTop: 4,
  },
});
