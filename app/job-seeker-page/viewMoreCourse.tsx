import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import LottieView from "lottie-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../../firebaseConfig";
import { courses } from "../model/dataType";

export default function DomainCourses() {
  const router = useRouter();
  const { domain } = useLocalSearchParams<{ domain?: string }>();

  const [courseList, setCourseList] = useState<courses[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

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
    if (!domain) {
      setLoading(false);
      return;
    }

    // Firestore query: domains array contains selected domain
    const q = query(
      collection(db, "courses"),
      where("domains", "array-contains", domain)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        course_id: doc.id,
        ...doc.data(),
      })) as courses[];

      setCourseList(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [domain]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredCourses =
    normalizedQuery === ""
      ? courseList
      : courseList.filter((course) => {
          const title = course.course_title?.toLowerCase() || "";
          const provider = course.provider_names?.join(" ").toLowerCase() || "";
          const subdomains = course.subdomains?.join(" ").toLowerCase() || "";

          return (
            title.includes(normalizedQuery) ||
            provider.includes(normalizedQuery) ||
            subdomains.includes(normalizedQuery)
          );
        });

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#7b9ef6ff" />
        <Text>Loading courses...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#d9efffff" }}>
      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={22} color="#1B457C" />
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <LottieView
            source={require("../../assets/education.json")}
            autoPlay
            loop
            style={{ width: 60, height: 60 }}
          />
          <View style={{ marginLeft: 8, flexShrink: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {domain || "Courses"}
            </Text>
            <Text style={styles.headerSubtitle}>
              {filteredCourses.length} course
              {filteredCourses.length === 1 ? "" : "s"} in this domain
            </Text>
          </View>
        </View>
      </View>

      {/* Course list */}
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Search bar */}
        <View style={styles.searchContainer}>
          <Ionicons
            name="search"
            size={20}
            color="#777"
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by title, provider, or topic"
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        {filteredCourses.length === 0 ? (
          <Text style={styles.emptyText}>
            No courses found for this search.
          </Text>
        ) : (
          filteredCourses.map((course) => (
            <TouchableOpacity
              key={course.course_id}
              style={styles.box}
              onPress={() =>
                router.push({
                  pathname: "./learningInformation",
                  params: {
                    id: course.course_id,
                    title: course.course_title,
                    description: course.course_description,
                    link: course.course_link,
                    image: course.course_image,
                  },
                })
              }
            >
              <View style={styles.textContainer}>
                <Text style={styles.courseTitle}>{course.course_title}</Text>

                <Text style={styles.courseProvider}>
                  {course.provider_names?.join(", ") || "Unknown Provider"}
                </Text>

                {course.subdomains && course.subdomains.length > 0 && (
                  <Text style={styles.subdomainText}>
                    {course.subdomains.join(" • ")}
                  </Text>
                )}

                <Text style={styles.achievementType}>Free Online Course</Text>
              </View>

              <Image
                source={
                  course.course_image
                    ? { uri: course.course_image }
                    : require("../../assets/images/logo.png")
                }
                style={styles.companyLogo}
              />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  header: {
    paddingTop: 50,
    paddingHorizontal: 15,
    paddingBottom: 10,
    backgroundColor: "#e6f1ffff",
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    padding: 6,
    borderRadius: 999,
    backgroundColor: "#d1e0ffff",
    marginRight: 8,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
  },
  headerTitle: {
    color: "#1B457C",
    fontSize: 20,
    fontWeight: "700",
  },
  headerSubtitle: {
    color: "#6b6b6b",
    fontSize: 13,
    marginTop: 2,
  },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#aec5ffff",
    paddingHorizontal: 12,
    marginTop: 10,
    marginBottom: 15,
    width: "100%",
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },

  scrollContainer: {
    padding: 15,
    paddingBottom: 100,
  },
  box: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    padding: 15,
    borderRadius: 10,
    backgroundColor: "#fff",
    elevation: 4,
    marginTop: 8,
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
  subdomainText: {
    fontSize: 13,
    color: "#8b8b8b",
    marginTop: 2,
  },
  achievementType: {
    fontSize: 13,
    color: "#8b8b8b",
    marginTop: 4,
  },
  companyLogo: {
    height: 65,
    width: 65,
    marginLeft: 20,
    borderRadius: 50,
  },
  emptyText: {
    textAlign: "center",
    color: "#888",
    marginTop: 20,
    fontSize: 16,
  },
});
