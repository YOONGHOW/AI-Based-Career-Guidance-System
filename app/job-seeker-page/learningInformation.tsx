import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, getDoc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
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
  const {
    id,
    title,
    description,
    link,
    image,
    provider_name,
    domain,
    subdomain,
  } = params;

  const [course, setCourse] = useState<courses | null>(null);
  const [loading, setLoading] = useState(true);
  const [alreadyRegister, setAlreadyRegister] = useState(false);
  const [userSkills, setUserSkills] = useState<string[]>([]);

  const [skills, setSkills] = useState<string[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);

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
    setCourse({
      course_id: id as string,
      course_title: title as string,
      course_description: description as string,
      course_link: link as string,
      course_image: image as string,
      provider_names: provider_name as string[],
      domains: domain as string[],
      subdomains: subdomain as string[],
    });

    setLoading(false);
  }, [id, title, description, link, image, provider_name, domain, subdomain]);

  useEffect(() => {
    const fetchSkills = async () => {
      if (!id) {
        setSkillsLoading(false);
        return;
      }

      try {
        const courseRef = doc(db, "courses", id as string);
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
  }, [id]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || !id) return;

    const courseId = Array.isArray(id) ? (id[0] as string) : (id as string);

    const userRef = doc(db, "users", user.uid);

    const unsubscribe = onSnapshot(userRef, (snap) => {
      if (!snap.exists()) {
        setAlreadyRegister(false);
        return;
      }

      const data = snap.data() || {};
      const registered: string[] = data.courseRegister_list || [];

      setAlreadyRegister(registered.includes(courseId));
    });

    return () => unsubscribe();
  }, [id]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    let unsubscribe: (() => void) | undefined;

    const fetchProfileAndListen = async () => {
      try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          setUserSkills([]);
          return;
        }

        const data = userSnap.data() || {};
        const profileId = data.profile_ids as string | undefined;

        if (!profileId) {
          setUserSkills([]);
          return;
        }

        const skillRef = doc(db, "skillProfile", profileId);

        unsubscribe = onSnapshot(skillRef, (snap) => {
          if (!snap.exists()) {
            setUserSkills([]);
            return;
          }

          const data = snap.data();
          const skills = (data.skills || []).map((s: string) =>
            s.trim().toLowerCase()
          );

          setUserSkills(skills);
        });
      } catch (err) {
        console.error("Error loading skill profile:", err);
        setUserSkills([]);
      }
    };

    fetchProfileAndListen();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const handleRegisterCourse = async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        Alert.alert("Error", "User not logged in");
        return;
      }

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.data() || {};

      const registered = userData.courseRegister_list || [];

      if (registered.includes(id)) {
        setAlreadyRegister(true);
        return;
      }

      const courseRegisterID = "course_" + Date.now();
      const newRegRef = doc(db, "courseRegisted", courseRegisterID);

      await setDoc(newRegRef, {
        courseRegister_id: courseRegisterID,
        userId: user.uid,
        course_id: id,
        courseTitle: title,
        courseLink: link,
        courseStatus: "Pinned",
        createdAt: new Date(),
      });

      await updateDoc(userRef, {
        courseRegister_list: [...registered, id],
      });

      Alert.alert("Success", "Course pinned successfully!");
      router.push("/(job-seekerTabs)/learn");
    } catch (error: any) {
      console.error(error);
      Alert.alert("Error", error.message);
    }
  };

  const handleOpenCourseLink = () => {
    if (link) Linking.openURL(link as string);
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

          <View style={styles.titleContainer}>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/job-seeker-page/providerDetails",
                  params: {
                    providerName: Array.isArray(provider_name)
                      ? provider_name[0]
                      : provider_name,
                  },
                })
              }
              style={{ alignItems: "center" }}
            >
              <Image
                source={
                  image
                    ? { uri: image.toString() }
                    : require("../../assets/images/logo.png")
                }
                style={styles.companyLogo}
              />
            </TouchableOpacity>

            <Text style={styles.courseTitle}>{title}</Text>
            <Text style={styles.companyName}>{provider_name}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.textContainer}>
            <Text style={styles.subheading}>Course Description:</Text>
            <Text style={styles.cert_description}>{description}</Text>
          </View>

          <View style={styles.divider} />

          <Text style={styles.subheading}>Skills you`ll gain:</Text>

          {skillsLoading ? (
            <View style={{ marginTop: 10 }}>
              <ActivityIndicator size="small" color="#007BFF" />
            </View>
          ) : skills.length > 0 ? (
            <View style={styles.skillChipContainer}>
              {skills.map((skill, index) => {
                const normalized = skill.trim().toLowerCase();
                const matched = userSkills.includes(normalized);

                return (
                  <View
                    key={index.toString()}
                    style={[
                      styles.skillChip,
                      matched && styles.skillChipMatched,
                    ]}
                  >
                    <Text
                      style={[
                        styles.skillChipText,
                        matched && styles.skillChipMatchedText,
                      ]}
                    >
                      {skill}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.noSkillsText}>
              No skills data available for this course.
            </Text>
          )}

          <TouchableOpacity
            style={[
              styles.applyButton,
              alreadyRegister ? styles.disabledButton : styles.applyButton,
            ]}
            onPress={handleRegisterCourse}
            disabled={alreadyRegister}
          >
            <Text style={styles.pinBtnText}>
              {alreadyRegister ? "Already Pinned" : "Pin this Courses"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.btnLearn}
            onPress={handleOpenCourseLink}
          >
            <Text style={styles.btnText}>Go to Course</Text>
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
  scrollContainer: {
    marginTop: 65,
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

  titleContainer: {
    alignItems: "center",
  },
  textContainer: {
    flex: 1,
  },
  courseTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 10,
    textAlign: "center",
  },
  companyName: {
    fontSize: 18,
    color: "#6b6b6b",
    marginTop: 4,
  },
  subheading: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1B457C",
    marginTop: 10,
  },
  cert_description: {
    fontSize: 15,
    color: "#8b8b8b",
    marginTop: 12,
    textAlign: "justify",
  },
  applyButton: {
    padding: 7,
    borderWidth: 2,
    borderColor: "#b5caffff",
    borderRadius: 25,
    width: "70%",
    alignSelf: "center",
    marginTop: 30,
    backgroundColor: "#c1d2faff",
  },
  disabledButton: {
    backgroundColor: "#bbddffff",
  },

  pinBtnText: {
    textAlign: "center",
    fontSize: 18,
    fontWeight: "600",
    color: "#1B457C",
  },

  btnLearn: {
    padding: 8,
    borderRadius: 25,
    width: "70%",
    alignSelf: "center",
    marginTop: 15,
    backgroundColor: "#53b4ad",
  },

  btnText: {
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
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

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

  skillChipMatched: {
    backgroundColor: "#d3fde2ff",
    borderWidth: 1,
    borderColor: "#5fce72ff",
  },
  skillChipMatchedText: {
    color: "#145a32",
    fontWeight: "700",
  },
});
