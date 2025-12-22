import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  collection,
  onSnapshot,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../firebaseConfig";

type SessionDoc = {
  id: string;
  role: string;
  startedAt?: Timestamp | null;
  endedAt?: Timestamp | null;
  overallScore?: number;
  communicationScore?: number;
  relevanceScore?: number;
  detailScore?: number;
  totalQuestions?: number;
  attemptedQuestions?: number;
  skippedQuestions?: number;
};

const formatDateTime = (ts?: Timestamp | null) => {
  if (!ts || !ts.toDate) return "";
  const d = ts.toDate();
  const date = d.toLocaleDateString("en-MY", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
  const time = d.toLocaleTimeString("en-MY", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} • ${time}`;
};

export default function InterviewHistoryScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionDoc[]>([]);
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

    const sessionsRef = collection(db, "mock_sessions");
    const q = query(sessionsRef, where("userId", "==", user.uid));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: SessionDoc[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as any;
          return {
            id: docSnap.id,
            role: data.role || "Unknown role",
            startedAt: data.startedAt || null,
            endedAt: data.endedAt || null,
            overallScore: data.overallScore ?? null,
            communicationScore: data.communicationScore ?? null,
            relevanceScore: data.relevanceScore ?? null,
            detailScore: data.detailScore ?? null,
            totalQuestions: data.totalQuestions ?? 0,
            attemptedQuestions: data.attemptedQuestions ?? 0,
            skippedQuestions: data.skippedQuestions ?? 0,
          };
        });
        setSessions(list);
        setLoading(false);
      },
      (err) => {
        console.error("Error loading sessions:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const ROLE_MAP: Record<string, string> = {
    data_scientist: "Data Scientist",
    marketing_associate: "Marketing Associate",
    software_engineer: "Software Engineer",
    qa_analyst: "QA Analyst",
    hr_specialist: "HR Specialist",
    uiux_designer: "UX Designer",
    machine_learning: "Machine Learning Engineer",
  };

  const normalizeRole = (raw?: string | null) => {
    if (!raw) return "Unknown role";
    if (Object.values(ROLE_MAP).includes(raw)) return raw;
    const key = raw.trim().toLowerCase();
    if (ROLE_MAP[key]) return ROLE_MAP[key];
    return raw
      .replace(/[_-]+/g, " ")
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  };

  useEffect(() => {
    if (sessions.length === 0) return;
    setSessions((prev) => {
      let changed = false;
      const mapped = prev.map((s) => {
        const newRole = normalizeRole(s.role);
        if (newRole !== s.role) {
          changed = true;
          return { ...s, role: newRole };
        }
        return s;
      });
      return changed ? mapped : prev;
    });
  }, [sessions]);

  const renderItem = ({ item }: { item: SessionDoc }) => {
    const attempted = item.attemptedQuestions ?? 0;
    const total = item.totalQuestions ?? 0;
    const overallDisplay =
      typeof item.overallScore === "number"
        ? `${item.overallScore.toFixed(0)} / 100`
        : "Not scored";

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() =>
          router.push({
            pathname: "/job-seeker-page/interviewResultDetail",
            params: { sessionId: item.id },
          })
        }
      >
        <View style={styles.cardHeaderRow}>
          <Text style={styles.roleText}>{item.role}</Text>
          <View style={styles.scorePill}>
            <Ionicons name="star" size={14} color="#fff" />
            <Text style={styles.scorePillText}>{overallDisplay}</Text>
          </View>
        </View>

        <Text style={styles.dateText}>{formatDateTime(item.startedAt)}</Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>
            Questions: {attempted} / {total}
          </Text>
          {typeof item.skippedQuestions === "number" &&
            item.skippedQuestions > 0 && (
              <Text style={styles.skippedText}>
                Skipped: {item.skippedQuestions}
              </Text>
            )}
        </View>

        <View style={styles.footerRow}>
          <View style={styles.badge}>
            <Ionicons name="chatbubbles-outline" size={14} color="#4a5fd4ff" />
            <Text style={styles.badgeText}>View Q&A</Text>
          </View>

          <Ionicons name="chevron-forward" size={20} color="#9aa4c8" />
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4a60c0ff" />
        <Text style={{ marginTop: 8 }}>Loading interview sessions...</Text>
      </View>
    );
  }

  if (!loading && sessions.length === 0) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.replace("/(job-seekerTabs)/learn")}
          >
            <Ionicons name="arrow-back" size={24} color="#1B457C" />
          </TouchableOpacity>
        </View>
        <View style={styles.no_session_center}>
          <Ionicons name="document-text-outline" size={50} color="#b3bedf" />
          <Text style={{ marginTop: 12, fontSize: 18, color: "#555" }}>
            No interview history yet
          </Text>
          <Text style={{ marginTop: 4, fontSize: 14, color: "#777" }}>
            Try starting your first mock interview.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.replace("/(job-seekerTabs)/learn")}
        >
          <Ionicons name="arrow-back" size={24} color="#1B457C" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Interview History</Text>
      </View>

      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#d9efffff",
    paddingTop: 50,
  },
  header: {
    paddingHorizontal: 20,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  backBtn: {
    padding: 4,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#656e9eff",
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    paddingTop: 15,
  },
  center: {
    flex: 1,
    backgroundColor: "#d9efffff",
    justifyContent: "center",
    alignItems: "center",
  },

  no_session_center: {
    justifyContent: "center",
    alignItems: "center",
    marginTop: "60%",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 16,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    elevation: 3,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  roleText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1B457C",
  },
  scorePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#4a5fd4ff",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  scorePillText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 4,
  },
  dateText: {
    marginTop: 4,
    fontSize: 13,
    color: "#7b86aa",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  metaText: {
    fontSize: 13,
    color: "#4b5f8f",
  },
  skippedText: {
    fontSize: 13,
    color: "#e57373",
    fontWeight: "500",
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eef2ff",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    marginLeft: 4,
    fontSize: 12,
    color: "#4a5fd4ff",
    fontWeight: "500",
  },
});
