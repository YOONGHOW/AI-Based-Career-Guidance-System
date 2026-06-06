import { useRouter } from "expo-router";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import LottieView from "lottie-react-native";
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
import { courses } from "../model/dataType";

const BACKEND_BASE_URL = "http://192.168.100.28:5000";

export default function Homepage() {
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
  const router = useRouter();
  const [courseList, setCourseList] = useState<courses[]>([]);
  const [loading, setLoading] = useState(true);

  const [recommendedCourses, setRecommendedCourses] = useState<courses[]>([]);
  const [loadingRecommended, setLoadingRecommended] = useState(true);
  const [userHasSkills, setUserHasSkills] = useState(false);

  // 🔹 Skill gap related state
  const [focusDomain, setFocusDomain] = useState<string | null>(null);
  const [haveSkills, setHaveSkills] = useState<string[]>([]);
  const [missingSkills, setMissingSkills] = useState<string[]>([]);
  const [domainSkills, setDomainSkills] = useState<string[]>([]);

  // ============================
  // Load ALL courses (for "Other courses & certificates")
  // ============================
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "courses"), (snapshot) => {
      const coursesData = snapshot.docs.map((doc) => ({
        course_id: doc.id,
        ...doc.data(),
      })) as courses[];
      setCourseList(coursesData);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // ============================
  // Skill Gap + Learning Path (calls /learning_path)
  // ============================
  useEffect(() => {
    const fetchLearningPath = async () => {
      try {
        setLoadingRecommended(true);

        const user = auth.currentUser;
        if (!user) {
          setUserHasSkills(false);
          setRecommendedCourses([]);
          setFocusDomain(null);
          setHaveSkills([]);
          setMissingSkills([]);
          setDomainSkills([]);
          return;
        }

        // 1️⃣ Get user document
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          setUserHasSkills(false);
          setRecommendedCourses([]);
          setFocusDomain(null);
          setHaveSkills([]);
          setMissingSkills([]);
          setDomainSkills([]);
          return;
        }

        const userData = userSnap.data() || {};
        const profileId = userData.profile_ids as string | undefined;
        const fieldOfStudy = userData.field_of_study as string | undefined; // optional

        if (!profileId) {
          setUserHasSkills(false);
          setRecommendedCourses([]);
          setFocusDomain(null);
          setHaveSkills([]);
          setMissingSkills([]);
          setDomainSkills([]);
          return;
        }

        // 2️⃣ Get skills from skillProfile/{profileId}
        const skillProfileRef = doc(db, "skillProfile", profileId);
        const skillProfileSnap = await getDoc(skillProfileRef);

        if (!skillProfileSnap.exists()) {
          setUserHasSkills(false);
          setRecommendedCourses([]);
          setFocusDomain(null);
          setHaveSkills([]);
          setMissingSkills([]);
          setDomainSkills([]);
          return;
        }

        const skillProfileData = skillProfileSnap.data() || {};
        const userSkills = (skillProfileData.skills || []) as string[];

        if (!userSkills || userSkills.length === 0) {
          setUserHasSkills(false);
          setRecommendedCourses([]);
          setFocusDomain(null);
          setHaveSkills([]);
          setMissingSkills([]);
          setDomainSkills([]);
          return;
        }

        // ✅ We have skills!
        setUserHasSkills(true);

        // 3️⃣ Call backend /learning_path
        const resp = await fetch(`${BACKEND_BASE_URL}/learning_path`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            skills: userSkills,
            field_of_study: fieldOfStudy,
          }),
        });

        if (!resp.ok) {
          console.error("learning_path error:", await resp.text());
          setRecommendedCourses([]);
          setFocusDomain(null);
          setHaveSkills([]);
          setMissingSkills([]);
          setDomainSkills([]);
          return;
        }

        const data = await resp.json();

        setFocusDomain(data.mapped_domain || null);
        setHaveSkills(data.have_skills || []);
        setMissingSkills(data.missing_skills || []);
        setDomainSkills(data.domain_skills || []);

        const apiCourses = (data.courses || []) as any[];

        const mappedCourses: courses[] = apiCourses.map((c) => ({
          course_id: c.course_id,
          course_title: c.course_title,
          course_description: c.course_description,
          course_image: c.course_image,
          course_link: c.course_link,
          provider_names: c.provider_names || [],
          domains: c.domains || [],
          subdomains: c.subdomains || [],
          coursera_skills: [],
          course_level: c.course_level,
        }));

        setRecommendedCourses(mappedCourses);
      } catch (err) {
        console.error("Error fetching learning path:", err);
        setRecommendedCourses([]);
        setUserHasSkills(false);
        setFocusDomain(null);
        setHaveSkills([]);
        setMissingSkills([]);
        setDomainSkills([]);
      } finally {
        setLoadingRecommended(false);
      }
    };

    fetchLearningPath();
  }, []);

  // ============================
  // Group "other courses" by domain
  // ============================
  const groupByDomain = (coursesList: courses[]) => {
    const grouped: Record<string, courses[]> = {};

    coursesList.forEach((course) => {
      const domains =
        course.domains && course.domains.length > 0
          ? course.domains
          : ["Others"];

      domains.forEach((domain) => {
        if (!grouped[domain]) grouped[domain] = [];
        grouped[domain].push(course);
      });
    });

    return grouped;
  };

  const groupedCourses = groupByDomain(courseList);

  // ============================
  // Skill match bar calculation
  // ============================
  const totalDomainSkills = domainSkills.length;
  const coveredSkillsCount = haveSkills.length;
  const skillMatchPercent =
    totalDomainSkills > 0
      ? Math.round((coveredSkillsCount / totalDomainSkills) * 100)
      : 0;

  // Show only top 5 recommended courses on this page
  const visibleRecommendedCourses = recommendedCourses.slice(0, 5);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#7b9ef6ff" />
        <Text>Loading...</Text>
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
        <View style={styles.animationbox}>
          <LottieView
            source={require("../../assets/education.json")}
            autoPlay
            loop
            style={{ width: 125, height: 125 }}
          />
          <Text style={styles.headerTitle}>Courses</Text>
        </View>

        {/* ============================
            Skill Gap + Learning Path section
           ============================ */}
        <Text style={styles.subheader}>Your Skill Gap & Learning Path</Text>

        {loadingRecommended ? (
          <View style={{ alignItems: "center", marginTop: 10 }}>
            <ActivityIndicator size="small" color="#7b9ef6ff" />
            <Text style={{ marginTop: 4, color: "#888" }}>
              Analyzing your skills and building your learning path...
            </Text>
          </View>
        ) : !userHasSkills ? (
          <Text style={styles.emptyText}>
            ** Please complete your profile first to get personalised learning
            paths **
          </Text>
        ) : recommendedCourses.length === 0 ? (
          <Text style={styles.emptyText}>
            We couldn&apos;t find matching courses yet. Try updating your skill
            profile.
          </Text>
        ) : (
          <>
            {/* Domain summary (optional) */}
            {focusDomain && (
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: "#1B457C",
                  marginBottom: 4,
                }}
              >
                Focus domain:{" "}
                <Text style={{ fontWeight: "800" }}>{focusDomain}</Text>
              </Text>
            )}

            {/* Skill match bar */}
            <View style={styles.skillBarContainer}>
              <View style={styles.skillBarHeader}>
                <Text style={styles.skillBarLabel}>Skill coverage</Text>
                <Text style={styles.skillBarLabel}>
                  {coveredSkillsCount}/{totalDomainSkills} skills (
                  {skillMatchPercent}%)
                </Text>
              </View>
              <View style={styles.skillBarBackground}>
                <View
                  style={[
                    styles.skillBarFill,
                    {
                      width: `${Math.min(skillMatchPercent, 100)}%`,
                    },
                  ]}
                />
              </View>
            </View>

            {/* 🔹 Button to view full skill list on another page */}
            <TouchableOpacity
              style={styles.skillDetailButton}
              onPress={() =>
                router.push({
                  pathname: "../job-seeker-page/skillGapDetails",
                  params: {
                    focusDomain: focusDomain || "",
                    haveSkills: JSON.stringify(haveSkills),
                    missingSkills: JSON.stringify(missingSkills),
                    domainSkills: JSON.stringify(domainSkills),
                    skillMatchPercent: skillMatchPercent.toString(),
                  },
                })
              }
            >
              <Text style={styles.skillDetailButtonText}>
                View detailed skill gap
              </Text>
            </TouchableOpacity>

            {/* Suggested courses (top 5) */}
            <Text style={styles.domain}>Suggested courses for your gaps</Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              style={{ marginTop: 2 }}
            >
              {visibleRecommendedCourses.map((course, index) => (
                <TouchableOpacity
                  key={course.course_id}
                  style={styles.card}
                  onPress={() =>
                    router.push({
                      pathname: "../job-seeker-page/learningInformation",
                      params: {
                        id: course.course_id,
                        title: course.course_title,
                        description: course.course_description,
                        link: course.course_link,
                        image: course.course_image,
                        provider_name: course.provider_names,
                        domain: course.domains,
                        subdomain: course.subdomains,
                      },
                    })
                  }
                >
                  <View style={styles.cardLeft}>
                    <Text
                      style={{
                        fontSize: 11,
                        color: "#8b8b8b",
                        marginBottom: 2,
                      }}
                    >
                      #{index + 1} • Covers your missing skills
                    </Text>

                    <Text style={styles.courseTitle} numberOfLines={2}>
                      {course.course_title}
                    </Text>

                    <Text style={styles.courseProvider} numberOfLines={1}>
                      {course.provider_names?.join(", ") || "Unknown Provider"}
                    </Text>

                    {course.subdomains && course.subdomains.length > 0 && (
                      <Text style={styles.subdomainText} numberOfLines={1}>
                        {course.subdomains.join(" • ")}
                      </Text>
                    )}

                    <Text style={styles.achievementType}>
                      {course.course_level || "Online Course"}
                    </Text>
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
              ))}
            </ScrollView>

            {/* 🔹 View more → DomainCourses (recommended) */}
            {recommendedCourses.length > 5 && focusDomain && (
              <TouchableOpacity
                style={styles.viewMoreButton}
                onPress={() =>
                  router.push({
                    pathname: "../job-seeker-page/viewMoreCourse",
                    params: { domain: focusDomain },
                  })
                }
              >
                <Text style={styles.viewMoreText}>
                  View more courses for recommended
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* ============================
            Other courses by domain
           ============================ */}
        <Text style={styles.subheader}>Other courses & certificates</Text>

        {Object.keys(groupedCourses).map((domain) => {
          const coursesInDomain = groupedCourses[domain];
          const limitedCourses = coursesInDomain.slice(0, 10);

          return (
            <View key={domain} style={{ marginTop: 12 }}>
              <Text style={styles.domain}>{domain}</Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalList}
              >
                {limitedCourses.map((course) => (
                  <TouchableOpacity
                    key={course.course_id}
                    style={styles.card}
                    onPress={() =>
                      router.push({
                        pathname: "../job-seeker-page/learningInformation",
                        params: {
                          id: course.course_id,
                          title: course.course_title,
                          description: course.course_description,
                          link: course.course_link,
                          image: course.course_image,
                          provider_name: course.provider_names,
                          domain: course.domains,
                          subdomain: course.subdomains,
                        },
                      })
                    }
                  >
                    <View style={styles.cardLeft}>
                      <Text style={styles.courseTitle} numberOfLines={2}>
                        {course.course_title}
                      </Text>

                      <Text style={styles.courseProvider} numberOfLines={1}>
                        {course.provider_names?.join(", ") ||
                          "Unknown Provider"}
                      </Text>

                      {course.subdomains && course.subdomains.length > 0 && (
                        <Text style={styles.subdomainText} numberOfLines={1}>
                          {course.subdomains.join(" • ")}
                        </Text>
                      )}

                      <Text style={styles.achievementType}>
                        Free Online Course
                      </Text>
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
                ))}
              </ScrollView>

              {coursesInDomain.length > 10 && (
                <TouchableOpacity
                  style={styles.viewMoreButton}
                  onPress={() =>
                    router.push({
                      pathname: "../job-seeker-page/viewMoreCourse",
                      params: { domain },
                    })
                  }
                >
                  <Text style={styles.viewMoreText}>View more in {domain}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    marginTop: 50,
    paddingBottom: 100,
    padding: 15,
  },
  headerTitle: {
    color: "#7a7f92ff",
    fontSize: 23,
    fontWeight: "700",
    marginLeft: 15,
  },
  subheader: {
    color: "#4a5fd4ff",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 10,
  },
  domain: {
    color: "#5274fcff",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6,
  },
  emptyText: {
    textAlign: "center",
    color: "#888",
    marginTop: 10,
    fontSize: 16,
  },
  animationbox: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    borderRadius: 10,
    backgroundColor: "#e6f1ffff",
    marginBottom: "2%",
  },
  horizontalList: {
    paddingVertical: 4,
  },
  card: {
    width: 260,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fff",
    elevation: 4,
    marginRight: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardLeft: {
    flex: 1,
    paddingRight: 10,
  },
  companyLogo: {
    height: 55,
    width: 55,
    borderRadius: 30,
    marginLeft: 10,
    borderColor: "#b7b7b7ff",
    borderWidth: 1,
  },
  courseTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1B457C",
  },
  courseProvider: {
    fontSize: 13,
    color: "#6b6b6b",
    marginTop: 2,
    fontWeight: "600",
  },
  subdomainText: {
    fontSize: 12,
    color: "#8b8b8b",
    marginTop: 2,
  },
  achievementType: {
    fontSize: 12,
    color: "#8b8b8b",
    marginTop: 4,
  },
  viewMoreButton: {
    alignSelf: "flex-start",
    marginTop: 6,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#90a5f9ff",
    backgroundColor: "#eef3ffff",
  },
  viewMoreText: {
    color: "#4a5fd4ff",
    fontWeight: "600",
    fontSize: 13,
  },
  // 🔹 Skill bar styles
  skillBarContainer: {
    marginTop: 6,
    marginBottom: 8,
  },
  skillBarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  skillBarLabel: {
    fontSize: 13,
    color: "#4a5fd4ff",
    fontWeight: "600",
  },
  skillBarBackground: {
    height: 15,
    borderRadius: 5,
    backgroundColor: "#ffffffff",
    overflow: "hidden",
  },
  skillBarFill: {
    height: "100%",
    borderRadius: 5,
    backgroundColor: "#4a5fd4ff",
  },
  // 🔹 Button to open detailed skill gap page
  skillDetailButton: {
    alignSelf: "flex-start",
    marginTop: 6,
    marginBottom: "8%",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#90a5f9ff",
    backgroundColor: "#eef3ffff",
  },
  skillDetailButtonText: {
    color: "#4a5fd4ff",
    fontSize: 13,
    fontWeight: "600",
  },
});
