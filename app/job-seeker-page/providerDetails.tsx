import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  collection,
  DocumentData,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../../firebaseConfig";

type ProviderDetail = {
  id?: string;
  name?: string;
  shortName?: string;
  description?: string;
  logo?: string;
  links?: any;
};

type CourseItem = {
  slug: string;
  course_title: string;
  course_description?: string;
  course_image?: string;
  course_link?: string;
};

export default function ProviderDetails() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const providerNameParam = params.providerName;

  const providerName = Array.isArray(providerNameParam)
    ? (providerNameParam[0] as string)
    : (providerNameParam as string);

  const [loading, setLoading] = useState(true);
  const [providerInfo, setProviderInfo] = useState<ProviderDetail | null>(null);
  const [courses, setCourses] = useState<CourseItem[]>([]);

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
    const fetchProviderAndCourses = async () => {
      if (!providerName) {
        setLoading(false);
        return;
      }

      try {
        const coursesRef = collection(db, "courses");
        const qCourses = query(
          coursesRef,
          where("provider_names", "array-contains", providerName)
        );

        const snap = await getDocs(qCourses);

        const courseList: CourseItem[] = [];
        let providerDetailFromFirstCourse: ProviderDetail | null = null;

        snap.forEach((docSnap) => {
          const data = docSnap.data() as DocumentData;
          const slug = data.slug || docSnap.id;

          if (
            !providerDetailFromFirstCourse &&
            Array.isArray(data.provider_details)
          ) {
            const firstProvider = data.provider_details[0];
            if (firstProvider && typeof firstProvider === "object") {
              providerDetailFromFirstCourse = {
                id: firstProvider.id,
                name: firstProvider.name,
                shortName: firstProvider.shortName,
                description: firstProvider.description,
                logo: firstProvider.logo,
                links: firstProvider.links,
              };
            }
          }

          courseList.push({
            slug,
            course_title: data.course_title || "Untitled course",
            course_description: data.course_description || "",
            course_image: data.course_image || "",
            course_link: data.course_link || "",
          });
        });

        setCourses(courseList);
        setProviderInfo(
          providerDetailFromFirstCourse || {
            name: providerName,
          }
        );
      } catch (error) {
        console.error("Error fetching provider and courses:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProviderAndCourses();
  }, [providerName]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007BFF" />
      </View>
    );
  }

  if (!providerName) {
    return (
      <View style={styles.center}>
        <Text style={{ fontSize: 16 }}>No provider selected.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#d9efff" }}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {providerInfo?.name || providerName}
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.box}>
          {/* Provider section */}
          <View style={styles.providerSection}>
            {providerInfo?.logo ? (
              <Image
                source={{ uri: providerInfo.logo }}
                style={styles.providerLogo}
              />
            ) : (
              <View style={styles.providerLogoPlaceholder}>
                <Text style={styles.providerLogoPlaceholderText}>
                  {providerInfo?.name?.charAt(0).toUpperCase() ??
                    providerName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}

            <Text style={styles.providerName}>
              {providerInfo?.name || providerName}
            </Text>

            {providerInfo?.description ? (
              <Text style={styles.providerDescription}>
                {providerInfo.description}
              </Text>
            ) : (
              <Text style={styles.providerDescriptionMuted}>
                No description available for this provider.
              </Text>
            )}
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Courses list */}
          <Text style={styles.subheading}>Courses by this provider</Text>

          {courses.length === 0 ? (
            <Text style={styles.emptyText}>
              No courses found for this provider.
            </Text>
          ) : (
            <View style={{ marginTop: 8 }}>
              {courses.map((course) => (
                <TouchableOpacity
                  key={course.slug}
                  style={styles.courseCard}
                  onPress={() =>
                    router.push({
                      pathname: "/job-seeker-page/learningInformation",
                      params: {
                        id: course.slug,
                        title: course.course_title,
                        description: course.course_description,
                        link: course.course_link,
                        image: course.course_image,
                        provider_name: providerName,
                      },
                    })
                  }
                >
                  <View style={{ flexDirection: "row" }}>
                    {course.course_image ? (
                      <Image
                        source={{ uri: course.course_image }}
                        style={styles.courseImage}
                      />
                    ) : (
                      <View style={styles.courseImagePlaceholder}>
                        <Ionicons
                          name="book-outline"
                          size={24}
                          color="#5a5a5a"
                        />
                      </View>
                    )}

                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.courseTitle} numberOfLines={2}>
                        {course.course_title}
                      </Text>
                      {course.course_description ? (
                        <Text
                          style={styles.courseDescription}
                          numberOfLines={3}
                        >
                          {course.course_description}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    paddingTop: 45,
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#d9efff",
  },
  backBtn: {
    padding: 6,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    flex: 1,
  },
  box: {
    width: "100%",
    padding: 16,
    borderRadius: 10,
    backgroundColor: "#fff",
    elevation: 4,
  },
  providerSection: {
    alignItems: "center",
  },
  providerLogo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#838383ff",
    resizeMode: "contain",
  },
  providerLogoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#e0e0e0",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  providerLogoPlaceholderText: {
    fontSize: 30,
    fontWeight: "700",
    color: "#555",
  },
  providerName: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  providerDescription: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 14,
    color: "#555",
  },
  providerDescriptionMuted: {
    marginTop: 8,
    textAlign: "center",
    fontSize: 13,
    color: "#888",
  },
  divider: {
    height: 1,
    backgroundColor: "#ccc",
    width: "100%",
    marginVertical: 16,
  },
  subheading: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1B457C",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#777",
  },
  courseCard: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#f5f7ff",
    marginBottom: 10,
  },
  courseImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  courseImagePlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: "#e0e0e0",
    justifyContent: "center",
    alignItems: "center",
  },
  courseTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  courseDescription: {
    fontSize: 13,
    color: "#666",
  },
});
