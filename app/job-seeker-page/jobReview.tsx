import { FontAwesome, Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
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
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../firebaseConfig";
import { courses, jobs } from "../model/dataType";

// 🔹 Helper: tokenize skills and ignore filler words
const STOP_WORDS = ["and", "&", "/", "with", "-", "to"];

const tokenizeSkill = (skill: string): string[] => {
  return skill
    .toLowerCase()
    .replace(/[()]/g, " ")
    .split(/[\s,\/\-+]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !STOP_WORDS.includes(s));
};

// 🔹 Fuzzy matcher: handles "html css" vs "html" & "css"
const isSkillMatch = (userSkill: string, jobSkill: string): boolean => {
  const u = userSkill.toLowerCase().trim();
  const j = jobSkill.toLowerCase().trim();

  if (!u || !j) return false;

  // exact or contains
  if (u === j) return true;
  if (u.includes(j) || j.includes(u)) return true;

  // word-based overlap
  const userTokens = tokenizeSkill(userSkill);
  const jobTokens = tokenizeSkill(jobSkill);

  return jobTokens.some((t) => userTokens.includes(t));
};

export default function Homepage() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [job, setJob] = useState<jobs | null>(null);
  const [loading, setLoading] = useState(true);
  const jobId = Array.isArray(id) ? id[0] : id;
  const uid = auth.currentUser?.uid;
  const [appliedDocId, setAppliedDocId] = useState<string | null>(null);
  const [relatedCourses, setRelatedCourses] = useState<courses[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [expandedSkills, setExpandedSkills] = useState(false);

  // 🔹 New: store user skills from career profile
  const [userSkills, setUserSkills] = useState<string[]>([]);

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
    const fetchJob = async () => {
      try {
        const docRef = doc(db, "job", id as string);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setJob({ job_id: docSnap.id, ...docSnap.data() } as jobs);
        }

        // check applied job
        const qApplied = query(
          collection(db, "job_applications"),
          where("jobId", "==", jobId),
          where("userId", "==", uid)
        );
        const appliedSnap = await getDocs(qApplied);

        if (!appliedSnap.empty) {
          setAppliedDocId(appliedSnap.docs[0].id);
        } else {
          console.log("User did not apply for this job");
        }

        // 🔹 Fetch user skills from career profile
        if (uid) {
          const userRef = doc(db, "users", uid);
          const userSnap = await getDoc(userRef);
          const profileId = userSnap.data()?.profile_ids;

          if (profileId) {
            const skillRef = doc(db, "skillProfile", profileId);
            const skillSnap = await getDoc(skillRef);
            if (skillSnap.exists()) {
              const skillData = skillSnap.data();
              setUserSkills((skillData.skills || []) as string[]);
            }
          }
        }
      } catch (error) {
        console.error("Error fetching job:", error);
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchJob();
  }, [id, jobId, uid]);

  useEffect(() => {
    if (!job) return;

    const fetchRelatedCourses = async () => {
      try {
        setLoadingCourses(true);

        // 1) Pick skills source: prefer Coursera skills, fallback to job_skill_set if needed
        const courseraSkills = Array.isArray(job.job_skill_coursera)
          ? (job.job_skill_coursera as string[])
          : [];

        const jobSkills = courseraSkills.length > 0 ? courseraSkills : [];

        if (!jobSkills || jobSkills.length === 0) {
          setRelatedCourses([]);
          setLoadingCourses(false);
          return;
        }

        // 2) Use only first 3 skills
        const topSkills = jobSkills.slice(0, 3);

        const qRef = query(
          collection(db, "courses"),
          where("coursera_skills", "array-contains-any", topSkills),
          limit(30)
        );

        const snapshot = await getDocs(qRef);
        const rawList = snapshot.docs.map((d) => ({
          course_id: d.id,
          ...d.data(),
        })) as any[];

        const scored = rawList.map((course) => {
          const courseSkills = Array.isArray(course.coursera_skills)
            ? course.coursera_skills
            : [];

          const overlapCount = courseSkills.filter((s: string) =>
            topSkills.includes(s)
          ).length;

          return { ...course, _overlapScore: overlapCount };
        });

        scored.sort((a, b) => b._overlapScore - a._overlapScore);

        const finalList: courses[] = scored
          .slice(0, 15)
          .map(({ _overlapScore, ...rest }) => rest as courses);

        setRelatedCourses(finalList);
      } catch (err) {
        console.error("Error fetching related courses:", err);
      } finally {
        setLoadingCourses(false);
      }
    };

    fetchRelatedCourses();
  }, [job]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007BFF" />
      </View>
    );
  }

  if (!job) {
    return (
      <View style={styles.center}>
        <Text>Job not found</Text>
      </View>
    );
  }
  const user = auth.currentUser;

  if (!user) {
    return null;
  }

  const deleteAppliedJob = async () => {
    if (!uid) {
      Alert.alert("Error", "User not found");
      return;
    }

    if (!appliedDocId) {
      Alert.alert("Error", "No applied job record found");
      return;
    }

    try {
      await deleteDoc(doc(db, "job_applications", appliedDocId));

      await updateDoc(doc(db, "users", uid), {
        jobApplied_id: arrayRemove(jobId),
      });

      Alert.alert("Removed", "Applied job removed successfully");
      router.push("/(job-seekerTabs)/job-status");
    } catch (err) {
      console.error("Delete failed:", err);
      Alert.alert("Error", "Unable to delete job application");
    }
  };

  const splitJobDescription = (desc: string): string[] => {
    if (!desc) return [];

    const normalized = desc.replace(/\r\n/g, "\n").trim();
    const lines = normalized
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length > 1) {
      return lines;
    }

    const sentences = normalized
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    return sentences;
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#d9efffff" }}>
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

          <TouchableOpacity style={styles.dltbutton} onPress={deleteAppliedJob}>
            <Ionicons name="trash" size={24} color="red" />
          </TouchableOpacity>

          <View style={styles.titleContainer}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                if (!job.company_id) {
                  Alert.alert(
                    "Company profile unavailable",
                    "This job is not linked to a company profile yet."
                  );
                  return;
                }

                router.push({
                  pathname: "/job-seeker-page/companyProfile",
                  params: {
                    companyId: job.company_id,
                    companyName: job.company_name,
                  },
                });
              }}
            >
              <Image
                source={
                  job.company_logo
                    ? { uri: job.company_logo }
                    : require("../../assets/images/logo.png")
                }
                style={styles.companyLogo}
              />
            </TouchableOpacity>

            <Text style={styles.jobTitle}>{job.job_name}</Text>
            <Text style={styles.companyName}>{job.company_name}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.textContainer}>
            <Text style={styles.location}>
              <Ionicons name="location" size={21} color="black" />
              {"  "}
              {job.job_location}
            </Text>
            <Text style={styles.jobType}>
              <Ionicons name="time" size={21} color="black" />
              {"  "}
              {job.job_type}
            </Text>
            <Text style={styles.salary}>
              <FontAwesome name="money" size={19} color="black" />
              {"  "}
              RM{job.job_salary}
            </Text>

            <View style={styles.divider} />

            <Text style={styles.subheading}>Job Responsibilities:</Text>
            <View style={{ maxHeight: 350, marginTop: 10 }}>
              <ScrollView
                style={styles.descriptionScroll}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}
              >
                <Text style={styles.job_descrip}>
                  {splitJobDescription(job.job_description).join("\n\n")}
                </Text>
              </ScrollView>
            </View>

            <View style={styles.divider} />

            <Text style={styles.subheading}>Highlight Required Skills:</Text>

            <View style={styles.divider} />

            {job.job_skill_coursera &&
            (job.job_skill_coursera as string[]).length > 0 ? (
              <>
                <View style={styles.skillChipsContainer}>
                  {(job.job_skill_coursera as string[])
                    .slice(
                      0,
                      expandedSkills
                        ? (job.job_skill_coursera as string[]).length
                        : 6
                    )
                    .map((skill, index) => {
                      const isMatched = userSkills.some((userSkill) =>
                        isSkillMatch(userSkill, skill)
                      );

                      return (
                        <View
                          key={index}
                          style={[
                            styles.skillChip,
                            isMatched
                              ? styles.skillChipMatched
                              : styles.skillChipUnmatched,
                          ]}
                        >
                          <Text
                            style={[
                              styles.skillChipText,
                              isMatched && styles.skillChipTextMatched,
                            ]}
                          >
                            {skill}
                          </Text>
                        </View>
                      );
                    })}
                </View>

                {(job.job_skill_coursera as string[]).length > 6 && (
                  <TouchableOpacity
                    onPress={() => setExpandedSkills((prev) => !prev)}
                    style={styles.viewMoreBtn}
                  >
                    <Text style={styles.viewMoreText}>
                      {expandedSkills ? "View Less" : "View More Skills"}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <Text style={styles.noSkillsText}>
                No specific skills listed for this job.
              </Text>
            )}
          </View>

          {/* COURSE RELATED */}
          <Text style={styles.subheading}>Courses Related:</Text>

          {loadingCourses ? (
            <View style={{ paddingVertical: 10 }}>
              <ActivityIndicator size="small" color="#4a5fd4ff" />
              <Text style={{ color: "#8b8b8b", marginTop: 4 }}>
                Finding courses that match this job...
              </Text>
            </View>
          ) : relatedCourses.length === 0 ? (
            <Text style={styles.noCourseText}>
              No related courses found for this job yet.
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              style={{ marginTop: 10 }}
            >
              {relatedCourses.map((course) => (
                <TouchableOpacity
                  key={course.course_id}
                  style={styles.courseCard}
                  onPress={() =>
                    router.push({
                      pathname: "/job-seeker-page/learningInformation",
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
                  <View style={styles.courseCardLeft}>
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
                  </View>

                  <Image
                    source={
                      course.course_image
                        ? { uri: course.course_image }
                        : require("../../assets/images/logo.png")
                    }
                    style={styles.courseLogo}
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
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
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 4,
  },
  companyLogo: {
    height: 100,
    width: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: "#d0d0d0ff",
    marginTop: 40,
    resizeMode: "contain",
  },

  titleContainer: {
    alignItems: "center",
    flex: 1,
  },

  textContainer: {
    flex: 1,
  },
  subheading: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1B457C",
  },

  jobTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1B457C",
    marginTop: 10,
  },
  companyName: {
    fontSize: 18,
    color: "#6b6b6b",
    marginTop: 4,
  },
  jobType: {
    fontSize: 15,
    color: "#8b8b8b",
    marginTop: 12,
  },
  descriptionScroll: {
    paddingRight: 10,
  },
  job_descrip: {
    fontSize: 15,
    color: "#8b8b8b",
    marginTop: 12,
    textAlign: "justify",
  },
  location: {
    fontSize: 15,
    color: "#8b8b8b",
  },
  salary: {
    fontSize: 15,
    color: "#8b8b8b",
    marginTop: 12,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  skillChipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
    marginBottom: 4,
  },
  // base chip shape
  skillChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 6,
    marginBottom: 6,
    borderWidth: 1,
  },
  // unmatched = blue (same as before)
  skillChipUnmatched: {
    backgroundColor: "#e6f1ff",
    borderColor: "#b5caffff",
  },
  // matched = green
  skillChipMatched: {
    backgroundColor: "#c9ffd3",
    borderColor: "#35a84f",
  },
  skillChipText: {
    fontSize: 13,
    color: "#1B457C",
    fontWeight: "600",
  },
  skillChipTextMatched: {
    color: "#1B712E",
    fontWeight: "700",
  },
  noSkillsText: {
    fontSize: 13,
    color: "#8b8b8b",
    marginTop: 6,
  },
  viewMoreBtn: {
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: "#e6f1ff",
    borderColor: "#b5caffff",
    borderWidth: 1,
    marginBottom: 10,
  },
  viewMoreText: {
    fontSize: 13,
    color: "#4a5fd4ff",
    fontWeight: "600",
  },
  horizontalList: {
    paddingVertical: 4,
  },
  courseCard: {
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
  courseCardLeft: {
    flex: 1,
    paddingRight: 10,
  },
  courseLogo: {
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
  noCourseText: {
    fontSize: 13,
    color: "#8b8b8b",
    marginTop: 8,
  },
  divider: {
    height: 2,
    backgroundColor: "#ccc",
    width: "100%",
    marginVertical: 12,
  },
});
