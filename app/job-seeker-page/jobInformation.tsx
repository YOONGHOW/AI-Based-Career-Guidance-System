import { FontAwesome, Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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

export default function Homepage() {
  const router = useRouter();
  const { id } = useLocalSearchParams();

  const [job, setJob] = useState<jobs | null>(null);
  const [loading, setLoading] = useState(true);
  const [alreadyApplied, setAlreadyApplied] = useState(false);
  const [expandedSkills, setExpandedSkills] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [relatedCourses, setRelatedCourses] = useState<courses[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);

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

  const fetchJob = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);

      const jobRef = doc(db, "job", id as string);
      const jobSnap = await getDoc(jobRef);

      if (!jobSnap.exists()) {
        Alert.alert("Error", "Job not found");
        setJob(null);
        return;
      }

      const jobData = { job_id: jobSnap.id, ...jobSnap.data() } as jobs;
      setJob(jobData);

      const user = auth.currentUser;
      if (!user) {
        Alert.alert("Error", "User not logged in");
        return;
      }

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        Alert.alert("Error", "User data not found");
        return;
      }

      const userData = userSnap.data() || {};
      const appliedList = (userData.jobApplied_id || []) as string[];
      const savedList = (userData.saved_job_ids || []) as string[];
      const hasApplied = appliedList.includes(jobData.job_id);
      setAlreadyApplied(hasApplied);

      const hasSaved = savedList.includes(jobData.job_id);
      setIsSaved(hasSaved);
    } catch (error) {
      console.error("Error fetching job:", error);
      Alert.alert("Error", "Failed to load job details");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      fetchJob();
    }, [fetchJob])
  );

  // 🔹 NEW: fetch user profile skills (from skillProfile)
  useEffect(() => {
    const fetchUserSkills = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          setUserSkills([]);
          return;
        }

        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          setUserSkills([]);
          return;
        }

        const userData = userSnap.data() || {};
        const profileIds = userData.profile_ids;

        let profileId: string | null = null;

        if (typeof profileIds === "string") {
          profileId = profileIds;
        } else if (Array.isArray(profileIds) && profileIds.length > 0) {
          profileId = profileIds[0];
        }

        if (!profileId) {
          setUserSkills([]);
          return;
        }

        const profileRef = doc(db, "skillProfile", profileId);
        const profileSnap = await getDoc(profileRef);

        if (profileSnap.exists()) {
          const data = profileSnap.data() as any;
          const skillArray = Array.isArray(data.skills) ? data.skills : [];
          setUserSkills(skillArray);
        } else {
          setUserSkills([]);
        }
      } catch (err) {
        console.error("Error fetching user skills:", err);
        setUserSkills([]);
      }
    };

    fetchUserSkills();
  }, []);

  const userSkillSet = useMemo(() => {
    return new Set(userSkills.map((s) => s.toLowerCase()));
  }, [userSkills]);

  const userSkillWordSet = useMemo(() => {
    const words = new Set<string>();

    userSkills.forEach((s) => {
      const norm = s.toLowerCase();
      const tokens = norm.split(/[^a-z0-9#+]+/).filter(Boolean);
      tokens.forEach((t) => words.add(t));
    });

    return words;
  }, [userSkills]);

  useEffect(() => {
    if (!job) return;

    const fetchRelatedCourses = async () => {
      try {
        setLoadingCourses(true);

        const courseraSkills = Array.isArray(job.job_skill_coursera)
          ? (job.job_skill_coursera as string[])
          : [];

        const fallbackSkills = Array.isArray(job.job_skill_set)
          ? (job.job_skill_set as string[])
          : [];

        const jobSkills =
          courseraSkills.length > 0 ? courseraSkills : fallbackSkills;

        if (!jobSkills || jobSkills.length === 0) {
          setRelatedCourses([]);
          setLoadingCourses(false);
          return;
        }

        const skillsForQuery = jobSkills.slice(0, 10);

        const courseMap: Record<string, any> = {};

        for (const skill of skillsForQuery) {
          const qRef = query(
            collection(db, "courses"),
            where("coursera_skills", "array-contains", skill),
            limit(25)
          );

          const snapshot = await getDocs(qRef);

          snapshot.forEach((d) => {
            const id = d.id;
            if (!courseMap[id]) {
              courseMap[id] = { course_id: id, ...d.data() };
            }
          });
        }

        const candidates = Object.values(courseMap) as any[];

        if (candidates.length === 0) {
          setRelatedCourses([]);
          return;
        }

        const scored = candidates.map((course) => {
          const courseSkills: string[] = Array.isArray(course.coursera_skills)
            ? course.coursera_skills
            : [];

          const overlapCount = courseSkills.filter((s) =>
            jobSkills.includes(s)
          ).length;

          return { ...course, _overlapCount: overlapCount };
        });

        const MIN_MATCH = 2;
        const filtered = scored.filter((c) => c._overlapCount >= MIN_MATCH);

        if (filtered.length === 0) {
          setRelatedCourses([]);
          return;
        }

        filtered.sort((a, b) => b._overlapCount - a._overlapCount);

        const finalList: courses[] = filtered
          .slice(0, 15)
          .map(({ _overlapCount, ...rest }) => rest as courses);

        setRelatedCourses(finalList);
      } catch (err) {
        console.error("Error fetching related courses:", err);
        setRelatedCourses([]);
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

  const courseraSkills = Array.isArray(job.job_skill_coursera)
    ? (job.job_skill_coursera as string[])
    : [];
  const fallbackSkills = Array.isArray(job.job_skill_set)
    ? (job.job_skill_set as string[])
    : [];
  const jobSkillsToShow =
    courseraSkills.length > 0 ? courseraSkills : fallbackSkills;

  const handleToggleSave = async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        Alert.alert("Error", "User not logged in");
        return;
      }

      if (!job) {
        return;
      }

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.data() || {};

      const savedList: string[] = userData.saved_job_ids || [];

      let updatedSavedList: string[];

      if (isSaved) {
        updatedSavedList = savedList.filter((jid) => jid !== job.job_id);
      } else {
        if (!savedList.includes(job.job_id)) {
          updatedSavedList = [...savedList, job.job_id];
        } else {
          updatedSavedList = savedList;
        }
      }

      await updateDoc(userRef, {
        saved_job_ids: updatedSavedList,
      });

      setIsSaved(!isSaved);
    } catch (err) {
      console.error("Error updating saved jobs:", err);
      Alert.alert("Error", "Failed to update saved jobs");
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#d9efffff" }}>
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.box}>
          {/* BACK BUTTON */}
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="black" />
          </TouchableOpacity>

          {/* HEADER */}
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

          {/* BASIC INFO */}
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
              {job.job_salary}
            </Text>

            <View style={styles.divider} />

            {/* JOB RESPONSIBILITIES */}
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
            <Text style={styles.skillHint}>
              ✔ Green skills are already in your profile.
            </Text>
            <View style={styles.divider} />

            {jobSkillsToShow && jobSkillsToShow.length > 0 ? (
              <>
                <View style={styles.skillChipsContainer}>
                  {jobSkillsToShow
                    .slice(0, expandedSkills ? jobSkillsToShow.length : 6)
                    .map((skill, index) => {
                      const normSkill = skill.toLowerCase();

                      const tokens = normSkill
                        .split(/[^a-z0-9#+]+/)
                        .filter(Boolean);
                      const isMatched =
                        userSkillSet.has(normSkill) ||
                        tokens.some((t) => userSkillWordSet.has(t));

                      return (
                        <View
                          key={index}
                          style={[
                            styles.skillChip,
                            isMatched && styles.skillChipMatched,
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

                {jobSkillsToShow.length > 6 && (
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
                        pathname: "/job-seeker-page/recommendedCourse",
                        params: {
                          id: course.course_id,
                          title: course.course_title,
                          description: course.course_description,
                          link: course.course_link,
                          image: course.course_image,
                          provider_name: course.provider_names,
                          domain: course.domains,
                          subdomain: course.subdomains,
                          jobSkill: job.job_skill_coursera,
                        },
                      })
                    }
                  >
                    <View style={styles.courseCardLeft}>
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

          {/* APPLY BUTTON */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.saveButton, isSaved && styles.saveButtonActive]}
              onPress={handleToggleSave}
            >
              <Ionicons
                name={isSaved ? "heart" : "heart-outline"}
                size={20}
                color={isSaved ? "#e0245e" : "#e0245e"}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.saveButtonText,
                  isSaved && styles.saveButtonTextActive,
                ]}
              >
                {isSaved ? "Saved" : "Save"}
              </Text>
            </TouchableOpacity>

            {/* Apply button */}
            <TouchableOpacity
              style={[
                styles.applyButton,
                alreadyApplied && styles.disabledButton,
              ]}
              onPress={() =>
                router.push({
                  pathname: "/job-seeker-page/applyJob",
                  params: { jobId: job.job_id },
                })
              }
              disabled={alreadyApplied}
            >
              <Text style={styles.btnText}>
                {alreadyApplied ? "Already Applied" : "Quick Apply"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backBtn: {
    position: "absolute",
    top: 30,
    left: 20,
    padding: 8,
  },
  favouritebutton: {
    position: "absolute",
    top: 30,
    right: 20,
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
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
  divider: {
    height: 2,
    backgroundColor: "#ccc",
    width: "100%",
    marginVertical: 12,
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
  descriptionScroll: {
    paddingRight: 10,
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

  // 🔹 Skill chips
  skillChipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
    marginBottom: 4,
  },
  skillChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#e6f1ff",
    borderWidth: 1,
    borderColor: "#b5caffff",
    marginRight: 6,
    marginBottom: 6,
  },
  skillChipMatched: {
    backgroundColor: "#c6f6d5",
    borderColor: "#38a169",
  },
  skillChipText: {
    fontSize: 13,
    color: "#1B457C",
    fontWeight: "600",
  },
  skillChipTextMatched: {
    color: "#22543d",
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
  skillHint: {
    fontSize: 12,
    color: "#6f6f6f",
    marginTop: 4,
    marginBottom: 4,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 24,
    gap: 10,
  },

  applyButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: "#b5caffff",
    borderRadius: 25,
    flex: 1,
    alignSelf: "center",
    backgroundColor: "#c1d2faff",
  },

  disabledButton: {
    backgroundColor: "#bbddffff",
    borderColor: "#759cfeff",
  },
  btnText: {
    textAlign: "center",
    fontSize: 17,
    fontWeight: "600",
    color: "#1B457C",
  },

  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: "#e9b5c4",
    backgroundColor: "#fff5f8",
    flexShrink: 1,
  },

  saveButtonActive: {
    backgroundColor: "#ffe0ea",
    borderColor: "#e0245e",
  },

  saveButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#b52b50",
  },

  saveButtonTextActive: {
    color: "#8b1838",
  },
});
