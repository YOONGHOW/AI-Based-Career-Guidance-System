import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
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

type AnswerDoc = {
  id: string;
  questionId: number;
  questionText: string;
  userAnswer: string | null;
  skipped: boolean;
  similarity?: number; // 0–1
  coverage?: number; // 0–1
  lengthScore?: number; // 0–1
  verdict?: string;
  modelAnswer?: string | null;
};

type CourseDoc = {
  id: string;
  course_title: string;
  course_link?: string;
  course_image?: string;
  provider_names?: string[];
  subdomains?: string[];
  domains?: string[];
  course_description?: string;
};

// map backend role -> Coursera subdomain name
const ROLE_TO_SUBDOMAIN: Record<string, string> = {
  data_scientist: "Data Analysis",
  marketing_associate: "Marketing",
  software_engineer: "Software Development",
  hr_specialist: "Leadership and Management",
  uiux_designer: "Design and Product",
  machine_learning: "Machine Learning",
};

function ScoreBar({ label, value }: { label: string; value: number }) {
  const clamped = Math.min(Math.max(value, 0), 100);

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

  return (
    <View style={styles.scoreRow}>
      <Text style={styles.scoreLabel}>{label}</Text>
      <View style={styles.scoreBarTrack}>
        <View style={[styles.scoreBarFill, { width: `${clamped}%` }]} />
      </View>
      <Text style={styles.scoreValue}>{clamped}%</Text>
    </View>
  );
}

export default function InterviewResultDetail() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();

  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<AnswerDoc[]>([]);

  const [sessionRole, setSessionRole] = useState<string | null>(null);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [courses, setCourses] = useState<CourseDoc[]>([]);

  useEffect(() => {
    if (!sessionId) return;

    const sessionRef = doc(db, "mock_sessions", sessionId);
    const answersRef = collection(sessionRef, "answers");
    const qAns = query(answersRef, orderBy("createdAt", "asc"));

    // listen answers
    const unsub = onSnapshot(
      qAns,
      (snapshot) => {
        const list: AnswerDoc[] = snapshot.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            questionId: data.questionId,
            questionText: data.questionText,
            userAnswer: data.userAnswer ?? null,
            skipped: !!data.skipped,
            similarity: data.similarity,
            coverage: data.coverage,
            lengthScore: data.lengthScore,
            verdict: data.verdict,
            modelAnswer: data.modelAnswer ?? null,
          };
        });
        setAnswers(list);
        setLoading(false);
      },
      (err) => {
        console.error("Error loading answers:", err);
        setLoading(false);
      }
    );

    // fetch session role one-time
    (async () => {
      try {
        const snap = await getDoc(sessionRef);
        if (snap.exists()) {
          const data = snap.data() as any;
          // backend role saved in session: e.g. "data_scientist"
          if (data.role) {
            setSessionRole(data.role as string);
          }
        }
      } catch (e) {
        console.error("Error loading session role:", e);
      }
    })();

    return () => unsub();
  }, [sessionId]);

  // when sessionRole is known, fetch related courses
  useEffect(() => {
    const fetchCourses = async () => {
      if (!sessionRole) return;

      const subdomainName = ROLE_TO_SUBDOMAIN[sessionRole];
      if (!subdomainName) {
        console.log("No subdomain mapping for role:", sessionRole);
        return;
      }

      try {
        setCoursesLoading(true);
        const coursesRef = collection(db, "courses");
        const qCourses = query(
          coursesRef,
          where("subdomains", "array-contains", subdomainName),
          limit(10)
        );
        const snap = await getDocs(qCourses);

        const list: CourseDoc[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            course_title: data.course_title,
            course_link: data.course_link,
            course_image: data.course_image,
            provider_names: data.provider_names || [],
            subdomains: data.subdomains || [],
            domains: data.domains || [],
            course_description: data.course_description || "",
          };
        });
        setCourses(list);
      } catch (e) {
        console.error("Error loading related courses:", e);
      } finally {
        setCoursesLoading(false);
      }
    };

    fetchCourses();
  }, [sessionRole]);

  // ==========================
  // Summary stats at top
  // ==========================
  const summary = useMemo(() => {
    if (!answers || answers.length === 0) {
      return {
        avgScore: null as number | null,
        attempted: 0,
        skipped: 0,
        good: 0,
        weak: 0,
      };
    }

    let attempted = 0;
    let skipped = 0;
    let good = 0;
    let weak = 0;
    let scoreSum = 0;

    answers.forEach((item) => {
      if (item.skipped) {
        skipped++;
        return;
      }

      const similarityPct =
        item.similarity != null ? item.similarity * 100 : null;
      const coveragePct = item.coverage != null ? item.coverage * 100 : null;
      const lengthPct =
        item.lengthScore != null ? item.lengthScore * 100 : null;

      const scoreList = [similarityPct, coveragePct, lengthPct].filter(
        (v) => v != null
      ) as number[];

      if (scoreList.length === 0) {
        attempted++;
        return;
      }

      const overall = scoreList.reduce((s, v) => s + v, 0) / scoreList.length;
      attempted++;
      scoreSum += overall;

      if (overall >= 70) {
        good++;
      } else {
        weak++;
      }
    });

    const avgScore = attempted > 0 ? Math.round(scoreSum / attempted) : null;

    return {
      avgScore,
      attempted,
      skipped,
      good,
      weak,
    };
  }, [answers]);

  if (!sessionId) {
    return (
      <View style={styles.center}>
        <Text style={{ color: "red" }}>No sessionId provided.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4a60c0ff" />
        <Text>Loading interview details...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#d9efffff", paddingTop: 50 }}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={26} color="black" />
      </TouchableOpacity>

      <Text style={styles.headerTitle}>Interview Q&A</Text>

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* ===== Summary Card ===== */}
        {answers.length > 0 && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Session Summary</Text>
            <View className="row" style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Average Score</Text>
              <Text
                style={[
                  styles.summaryValue,
                  summary.avgScore != null &&
                    summary.avgScore < 70 && {
                      color: "red",
                    },
                ]}
              >
                {summary.avgScore != null
                  ? `${summary.avgScore}/100`
                  : "No score"}
              </Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Attempted</Text>
              <Text style={styles.summaryValue}>{summary.attempted}</Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Skipped</Text>
              <Text style={styles.summaryValue}>{summary.skipped}</Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Good Answers (≥ 70)</Text>
              <Text style={[styles.summaryValue, { color: "#2e7d32" }]}>
                {summary.good}
              </Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Need Improvement</Text>
              <Text style={[styles.summaryValue, { color: "#c62828" }]}>
                {summary.weak}
              </Text>
            </View>
          </View>
        )}

        {/* ===== Q & A List ===== */}
        {answers.length === 0 ? (
          <Text style={{ textAlign: "center", color: "#666", marginTop: 20 }}>
            No answers found for this session.
          </Text>
        ) : (
          answers.map((item, index) => {
            const similarityPct =
              item.similarity != null
                ? Math.round(item.similarity * 100)
                : null;
            const coveragePct =
              item.coverage != null ? Math.round(item.coverage * 100) : null;
            const lengthPct =
              item.lengthScore != null
                ? Math.round(item.lengthScore * 100)
                : null;

            const scoreList = [similarityPct, coveragePct, lengthPct].filter(
              (v) => v != null
            ) as number[];

            const overallScore =
              scoreList.length > 0
                ? Math.round(
                    scoreList.reduce((sum, v) => sum + v, 0) / scoreList.length
                  )
                : null;

            const isGoodAnswer =
              !item.skipped && overallScore !== null && overallScore >= 70;

            return (
              <View key={item.id} style={styles.qaBlock}>
                <View style={styles.questionBubble}>
                  {/* Q label + status icon */}
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={styles.qLabel}>
                      Q{item.questionId || index + 1}
                    </Text>
                  </View>

                  {/* Question text */}
                  <Text style={styles.qText}>{item.questionText}</Text>

                  {/* Total score indicator per question */}
                  <View style={styles.overallRow}>
                    <Text style={styles.overallLabel}>Total Score</Text>
                    <Text
                      style={[
                        styles.overallValue,
                        overallScore != null &&
                          overallScore < 70 && {
                            color: "red",
                          },
                      ]}
                    >
                      {overallScore != null
                        ? `${overallScore}/100`
                        : item.skipped
                        ? "Not scored (skipped)"
                        : "No score"}
                    </Text>
                  </View>

                  {/* Score bars */}
                  {(similarityPct != null ||
                    coveragePct != null ||
                    lengthPct != null) && (
                    <View style={{ marginTop: 6 }}>
                      {similarityPct != null && (
                        <ScoreBar label="Similarity" value={similarityPct} />
                      )}
                      {coveragePct != null && (
                        <ScoreBar
                          label="Keyword Coverage"
                          value={coveragePct}
                        />
                      )}
                      {lengthPct != null && (
                        <ScoreBar label="Answer Length" value={lengthPct} />
                      )}
                    </View>
                  )}

                  {/* Sample answer */}
                  <Text style={styles.aLabel}>Sample Answer</Text>
                  {item.modelAnswer ? (
                    <Text style={styles.aText}>{item.modelAnswer}</Text>
                  ) : (
                    <Text style={[styles.aText, { color: "#777" }]}>
                      No sample answer available.
                    </Text>
                  )}

                  {/* User answer */}
                  <Text style={styles.aLabel}>Your Answer</Text>
                  {item.skipped ? (
                    <Text style={[styles.aText, { color: "#999" }]}>
                      Skipped by user.
                    </Text>
                  ) : (
                    <Text
                      style={[
                        styles.aText,
                        !isGoodAnswer && { color: "red", fontWeight: "600" },
                      ]}
                    >
                      {item.userAnswer || "No answer recorded."}
                    </Text>
                  )}

                  {/* Verdict text if any */}
                  {item.verdict && (
                    <Text style={styles.verdictText}>{item.verdict}</Text>
                  )}
                </View>
              </View>
            );
          })
        )}
        {/* ===== Related Courses (vertical boxes) ===== */}
        {sessionRole && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Recommended Learning</Text>

            {coursesLoading ? (
              <Text style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
                Loading courses...
              </Text>
            ) : courses.length === 0 ? (
              <Text style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
                No related courses found yet.
              </Text>
            ) : (
              <View style={{ marginTop: 6 }}>
                {courses.slice(0, 3).map((c, index) => (
                  <TouchableOpacity
                    key={c.id}
                    style={styles.courseCard}
                    onPress={() =>
                      router.push({
                        pathname: "/job-seeker-page/learningInformation",
                        params: {
                          id: c.id,
                          title: c.course_title,
                          description: c.course_description,
                          link: c.course_link,
                          image: c.course_image,
                          provider_name: c.provider_names,
                          domain: c.domains,
                          subdomain: c.subdomains,
                        },
                      })
                    }
                  >
                    <View style={styles.courseCardLeft}>
                      <Text style={styles.courseTitle} numberOfLines={2}>
                        {c.course_title}
                      </Text>

                      <Text style={styles.courseProvider} numberOfLines={1}>
                        {c.provider_names?.join(", ") || "Unknown Provider"}
                      </Text>

                      {c.subdomains && c.subdomains.length > 0 && (
                        <Text style={styles.subdomainText} numberOfLines={1}>
                          {c.subdomains.join(" • ")}
                        </Text>
                      )}

                      <Text style={styles.achievementType}>
                        Free Online Course
                      </Text>
                    </View>

                    <Image
                      source={
                        c.course_image
                          ? { uri: c.course_image }
                          : require("../../assets/images/logo.png")
                      }
                      style={styles.courseLogo}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: "#d9efffff",
    justifyContent: "center",
    alignItems: "center",
  },
  backBtn: {
    position: "absolute",
    top: 40,
    left: 20,
    padding: 8,
    zIndex: 10,
  },
  headerTitle: {
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
    color: "#4a5fd4ff",
    marginBottom: "3%",
  },
  scrollContainer: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },

  // Summary / courses cards
  summaryCard: {
    marginBottom: 12,
    backgroundColor: "#ffffffff",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#c8d4ff",
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1B457C",
    marginBottom: 6,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
  },
  summaryLabel: {
    fontSize: 13,
    color: "#445",
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#333",
  },

  // Course card (same style as Homepage but vertical list)
  courseCard: {
    width: "100%",
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fff",
    elevation: 5,
    marginBottom: 10,
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
  achievementType: {
    fontSize: 12,
    color: "#8b8b8b",
    marginTop: 4,
  },

  qaBlock: {
    marginBottom: 18,
  },
  questionBubble: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    backgroundColor: "#ffffffff",
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#c8d4ff",
  },
  qLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#4a5fd4ff",
    marginBottom: 4,
  },
  qText: {
    fontSize: 16,
    color: "#1B457C",
    marginBottom: 4,
  },
  aLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1B457C",
    marginTop: 10,
    marginBottom: 4,
  },
  aText: {
    fontSize: 14,
    color: "#333",
  },
  verdictText: {
    fontSize: 12,
    color: "#666",
    marginTop: 6,
  },

  // Per-question score section
  overallRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
  overallLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1B457C",
  },
  overallValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2e7d32",
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  scoreLabel: {
    width: 110,
    fontSize: 12,
    color: "#445",
  },
  scoreBarTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#dde3ff",
    overflow: "hidden",
    marginHorizontal: 6,
  },
  scoreBarFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#4a5fd4ff",
  },
  scoreValue: {
    width: 45,
    fontSize: 12,
    textAlign: "right",
    color: "#333",
  },
});
