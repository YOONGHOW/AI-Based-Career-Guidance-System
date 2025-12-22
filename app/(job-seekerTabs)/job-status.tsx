import { useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import LottieView from "lottie-react-native";
import React, { useEffect, useState } from "react";
import {
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
import { jobApplied, jobs } from "../model/dataType";

export default function JobStatus() {
  const router = useRouter();
  const [jobAppliedList, setJobAppliedList] = useState<jobApplied[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedJobs, setSavedJobs] = useState<jobs[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);

  const [selectedTab, setSelectedTab] = useState<"applied" | "saved">(
    "applied"
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
    const user = auth.currentUser;
    if (!user) return;

    const userRef = doc(db, "users", user.uid);

    const unsubscribeUser = onSnapshot(userRef, async (snap) => {
      if (!snap.exists()) {
        setSavedJobs([]);
        setLoadingSaved(false);
        return;
      }

      const data = snap.data() || {};
      const savedIds: string[] = data.saved_job_ids || [];

      if (!savedIds || savedIds.length === 0) {
        setSavedJobs([]);
        setLoadingSaved(false);
        return;
      }

      try {
        setLoadingSaved(true);

        const jobPromises = savedIds.map((jobId) =>
          getDoc(doc(db, "job", jobId))
        );
        const jobSnaps = await Promise.all(jobPromises);

        const jobsList: jobs[] = jobSnaps
          .filter((d) => d.exists())
          .map((d) => {
            const data = d.data() as jobs;
            return {
              ...data,
              job_id: d.id,
            };
          });

        setSavedJobs(jobsList);
      } catch (err) {
        console.error("Error loading saved jobs:", err);
        setSavedJobs([]);
      } finally {
        setLoadingSaved(false);
      }
    });

    return () => unsubscribeUser();
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const appliedQuery = query(
      collection(db, "job_applications"),
      where("userId", "==", user.uid)
    );

    const unsubscribeApplied = onSnapshot(appliedQuery, (appliedSnap) => {
      const appliedDocs = appliedSnap.docs.map((doc) => ({
        jobApplied_id: doc.id,
        ...doc.data(),
      })) as jobApplied[];

      if (appliedDocs.length === 0) {
        setJobAppliedList([]);
        setLoading(false);
        return;
      }

      const unsubscribeJobs = onSnapshot(collection(db, "job"), (jobSnap) => {
        const jobMap = new Map<string, jobs>();
        jobSnap.docs.forEach((doc) => jobMap.set(doc.id, doc.data() as jobs));

        const merged = appliedDocs.map((applied) => ({
          ...applied,
          jobDetails: jobMap.get(applied.jobId),
        }));

        setJobAppliedList(merged);
        setLoading(false);
      });

      return () => unsubscribeJobs();
    });

    return () => unsubscribeApplied();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
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
        <View style={styles.headContainer}>
          <View style={styles.animationbox}>
            <LottieView
              source={require("../../assets/find.json")}
              autoPlay
              loop
              style={{ width: 130, height: 130 }}
            />
            <Text style={styles.headerTitle}>My Jobs</Text>
          </View>
        </View>

        {/* 🔹 Tabs */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[
              styles.tabAppliedButton,
              selectedTab === "applied" && styles.tabAppliedButtonActive,
            ]}
            onPress={() => setSelectedTab("applied")}
          >
            <Text
              style={[
                styles.tabText,
                selectedTab === "applied" && styles.tabAppliedTextActive,
              ]}
            >
              Applied
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabSavedButton,
              selectedTab === "saved" && styles.tabSavedButtonActive,
            ]}
            onPress={() => setSelectedTab("saved")}
          >
            <Text
              style={[
                styles.tabText,
                selectedTab === "saved" && styles.tabSavedTextActive,
              ]}
            >
              Saved
            </Text>
          </TouchableOpacity>
        </View>

        {selectedTab === "applied" ? (
          jobAppliedList.length === 0 ? (
            <View style={{ marginTop: 60 }}>
              <Text style={styles.emptyText}>No job applications yet.</Text>
              <LottieView
                source={require("../../assets/no-result.json")}
                autoPlay
                loop
                style={{
                  width: 165,
                  height: 165,
                  alignSelf: "center",
                }}
              />

              <TouchableOpacity
                style={styles.navButton}
                onPress={() => router.push("/(job-seekerTabs)/home")}
              >
                <Text style={styles.navButtonText}>Apply for Jobs Now!</Text>
              </TouchableOpacity>
            </View>
          ) : (
            jobAppliedList.map((applied) => (
              <TouchableOpacity
                key={applied.jobApplied_id}
                style={styles.box}
                onPress={() =>
                  router.push({
                    pathname: "/job-seeker-page/jobReview",
                    params: { id: applied.jobDetails?.job_id },
                  })
                }
              >
                <Image
                  source={
                    applied.jobDetails?.company_logo
                      ? { uri: applied.jobDetails.company_logo }
                      : require("../../assets/images/logo.png")
                  }
                  style={styles.companyLogo}
                />
                <View style={styles.textContainer}>
                  <Text style={styles.jobTitle}>
                    {applied.jobDetails?.job_name}
                  </Text>
                  <Text style={styles.companyName}>
                    {applied.jobDetails?.company_name}
                  </Text>
                  <Text style={styles.jobType}>
                    {applied.jobDetails?.job_type}
                  </Text>
                  <Text style={styles.location}>
                    {applied.jobDetails?.job_location}
                  </Text>
                  <Text style={styles.status}>
                    Status:{" "}
                    <Text style={styles.statusChange}>{applied.status}</Text>
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )
        ) : (
          // 🔹 SAVED TAB
          <>
            {loadingSaved ? (
              <View style={{ marginTop: 30 }}>
                <Text style={styles.emptyText}>Loading saved jobs...</Text>
              </View>
            ) : savedJobs.length === 0 ? (
              <View style={{ marginTop: 60 }}>
                <Text style={styles.emptyText}>No saved jobs yet.</Text>
                <LottieView
                  source={require("../../assets/no-result.json")}
                  autoPlay
                  loop
                  style={{
                    width: 165,
                    height: 165,
                    alignSelf: "center",
                  }}
                />

                <TouchableOpacity
                  style={styles.navButton}
                  onPress={() => router.push("/(job-seekerTabs)/home")}
                >
                  <Text style={styles.navButtonText}>Browse & Save Jobs</Text>
                </TouchableOpacity>
              </View>
            ) : (
              savedJobs.map((job) => (
                <TouchableOpacity
                  key={job.job_id}
                  style={styles.box}
                  onPress={() =>
                    router.push({
                      pathname: "/job-seeker-page/jobInformation",
                      params: { id: job.job_id },
                    })
                  }
                >
                  <Image
                    source={
                      job.company_logo
                        ? { uri: job.company_logo }
                        : require("../../assets/images/logo.png")
                    }
                    style={styles.companyLogo}
                  />
                  <View style={styles.textContainer}>
                    <Text style={styles.jobTitle}>{job.job_name}</Text>
                    <Text style={styles.companyName}>{job.company_name}</Text>
                    <Text style={styles.jobType}>{job.job_type}</Text>
                    <Text style={styles.location}>{job.job_location}</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    marginTop: 50,
    padding: 10,
    paddingBottom: 100,
  },

  headContainer: {
    padding: 5,
    marginBottom: 20,
  },

  animationbox: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    borderRadius: 10,
    backgroundColor: "#e6f1ffff",
  },
  headerTitle: {
    color: "#7a7f92ff",
    fontSize: 23,
    fontWeight: "700",
    marginLeft: 15,
  },

  tabRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
    gap: 10,
  },

  tabAppliedButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#c3c7ddff",
    backgroundColor: "#f3f4fbff",
    width: "40%",
    paddingVertical: 8,
  },

  tabSavedButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#c3c7ddff",
    backgroundColor: "#f3f4fbff",
    width: "40%",
    paddingVertical: 8,
  },
  tabAppliedButtonActive: {
    backgroundColor: "#c1d2faff",
    borderColor: "#7b9ef6ff",
  },

  tabSavedButtonActive: {
    backgroundColor: "#ffbebeff",
    borderColor: "#fc7575ff",
  },

  tabText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#7a7f95ff",
  },

  tabAppliedTextActive: {
    color: "#1B457C",
  },
  tabSavedTextActive: {
    color: "#a83232ff",
  },

  box: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    padding: 15,
    borderRadius: 10,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 4,
    marginTop: 12,
  },
  companyLogo: {
    height: 80,
    width: 80,
    marginRight: 20,
    borderRadius: 5,
  },

  navButton: {
    padding: 8,
    borderWidth: 2,
    borderColor: "#7b9ef6ff",
    borderRadius: 20,
    alignSelf: "center",
    backgroundColor: "#ffffffff",
  },
  navButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1B457C",
    textAlign: "center",
  },

  textContainer: {
    flex: 1,
  },
  jobTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1B457C",
  },
  companyName: {
    fontSize: 18,
    color: "#6b6b6b",
    marginTop: 4,
  },
  jobType: {
    fontSize: 15,
    color: "#8b8b8b",
    marginTop: 2,
  },
  location: {
    fontSize: 15,
    color: "#8b8b8b",
    marginTop: 2,
  },
  salary: {
    fontSize: 15,
    color: "#8b8b8b",
    marginTop: 2,
  },
  status: {
    fontSize: 16,
    color: "#81a2faff",
    marginTop: 15,
    fontWeight: "bold",
  },
  statusChange: {
    fontSize: 15,
    color: "#abb8ffff",
    fontWeight: "bold",
  },
  emptyText: {
    textAlign: "center",
    color: "#888",
    marginTop: 20,
    fontSize: 16,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
