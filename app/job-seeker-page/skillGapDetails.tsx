import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import LottieView from "lottie-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  BackHandler,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const SKILL_PREVIEW_COUNT = 10;

export default function SkillGapDetails() {
  const router = useRouter();

  const {
    focusDomain,
    haveSkills: haveSkillsParam,
    missingSkills: missingSkillsParam,
    domainSkills: domainSkillsParam,
    skillMatchPercent: skillMatchPercentParam,
  } = useLocalSearchParams<{
    focusDomain?: string;
    haveSkills?: string;
    missingSkills?: string;
    domainSkills?: string;
    skillMatchPercent?: string;
  }>();

  // ---------- local "view more" toggles ----------
  const [showAllHaveSkills, setShowAllHaveSkills] = useState(false);
  const [showAllMissingSkills, setShowAllMissingSkills] = useState(false);
  const [showAllDomainSkills, setShowAllDomainSkills] = useState(false);

  // Safe JSON parsing helpers
  const parseArrayParam = (value?: string) => {
    if (!value) return [] as string[];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [] as string[];
    }
  };

  const haveSkills = useMemo(
    () => parseArrayParam(haveSkillsParam as string),
    [haveSkillsParam]
  );
  const missingSkills = useMemo(
    () => parseArrayParam(missingSkillsParam as string),
    [missingSkillsParam]
  );
  const domainSkills = useMemo(
    () => parseArrayParam(domainSkillsParam as string),
    [domainSkillsParam]
  );

  const skillMatchPercent = useMemo(() => {
    if (!skillMatchPercentParam) return 0;
    const n = Number(skillMatchPercentParam);
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }, [skillMatchPercentParam]);

  const totalDomainSkills = domainSkills.length;
  const coveredSkillsCount = haveSkills.length;

  // ---------- visible slices (15 + view more) ----------
  const visibleHaveSkills = showAllHaveSkills
    ? haveSkills
    : haveSkills.slice(0, SKILL_PREVIEW_COUNT);

  const visibleMissingSkills = showAllMissingSkills
    ? missingSkills
    : missingSkills.slice(0, SKILL_PREVIEW_COUNT);

  const visibleDomainSkills = showAllDomainSkills
    ? domainSkills
    : domainSkills.slice(0, SKILL_PREVIEW_COUNT);

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
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#d9efffff" }}>
      {/* Header */}
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
              Skill Gap Overview
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={2}>
              {focusDomain
                ? `Target domain: ${focusDomain}`
                : "Target domain from your learning path"}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Summary Card */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Skill coverage summary</Text>

          <Text style={styles.summaryText}>
            You have{" "}
            <Text style={styles.summaryHighlight}>{coveredSkillsCount}</Text>{" "}
            out of{" "}
            <Text style={styles.summaryHighlight}>{totalDomainSkills}</Text>{" "}
            skills for this domain.
          </Text>

          {/* Skill bar */}
          <View style={styles.skillBarContainer}>
            <View style={styles.skillBarHeader}>
              <Text style={styles.skillBarLabel}>Coverage</Text>
              <Text style={styles.skillBarLabel}>{skillMatchPercent}%</Text>
            </View>
            <View style={styles.skillBarBackground}>
              <View
                style={[
                  styles.skillBarFill,
                  { width: `${skillMatchPercent}%` },
                ]}
              />
            </View>
          </View>
        </View>

        {/* You already have */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>You already have</Text>
          <Text style={styles.sectionSubtitle}>
            Skills we found in your profile that match this domain.
          </Text>

          {haveSkills.length === 0 ? (
            <Text style={styles.emptyText}>
              No matched skills yet for this domain.
            </Text>
          ) : (
            <>
              <View style={styles.chipContainer}>
                {visibleHaveSkills.map((skill) => (
                  <View key={skill} style={styles.haveChip}>
                    <Text style={styles.haveChipText}>{skill}</Text>
                  </View>
                ))}
              </View>

              {haveSkills.length > SKILL_PREVIEW_COUNT && (
                <TouchableOpacity
                  onPress={() => setShowAllHaveSkills(!showAllHaveSkills)}
                  style={styles.viewMoreButton}
                >
                  <Text style={styles.viewMoreText}>
                    {showAllHaveSkills
                      ? "Hide extra skills"
                      : `View more skills (${
                          haveSkills.length - SKILL_PREVIEW_COUNT
                        } more)`}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* You are missing */}
        <View style={styles.sectionCard}>
          <Text style={[styles.sectionTitle, { color: "#c7512f" }]}>
            You are missing
          </Text>
          <Text style={styles.sectionSubtitle}>
            Important skills for this domain that you have not yet listed in
            your profile.
          </Text>

          {missingSkills.length === 0 ? (
            <Text style={styles.emptyText}>
              Great! You already match the target skill set for this domain.
            </Text>
          ) : (
            <>
              <View style={styles.chipContainer}>
                {visibleMissingSkills.map((skill) => (
                  <View key={skill} style={styles.missingChip}>
                    <Text style={styles.missingChipText}>{skill}</Text>
                  </View>
                ))}
              </View>

              {missingSkills.length > SKILL_PREVIEW_COUNT && (
                <TouchableOpacity
                  onPress={() => setShowAllMissingSkills(!showAllMissingSkills)}
                  style={styles.viewMoreButton}
                >
                  <Text style={styles.viewMoreText}>
                    {showAllMissingSkills
                      ? "Hide extra skills"
                      : `View more skills (${
                          missingSkills.length - SKILL_PREVIEW_COUNT
                        } more)`}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* Full domain skill set */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            Full skill set for this domain
          </Text>
          <Text style={styles.sectionSubtitle}>
            All skills we collected from Coursera courses for this domain.
          </Text>

          {domainSkills.length === 0 ? (
            <Text style={styles.emptyText}>
              No domain skill set available yet.
            </Text>
          ) : (
            <>
              <View style={styles.chipContainer}>
                {visibleDomainSkills.map((skill) => (
                  <View key={skill} style={styles.domainChip}>
                    <Text style={styles.domainChipText}>{skill}</Text>
                  </View>
                ))}
              </View>

              {domainSkills.length > SKILL_PREVIEW_COUNT && (
                <TouchableOpacity
                  onPress={() => setShowAllDomainSkills(!showAllDomainSkills)}
                  style={styles.viewMoreButton}
                >
                  <Text style={styles.viewMoreText}>
                    {showAllDomainSkills
                      ? "Hide extra skills"
                      : `View more skills (${
                          domainSkills.length - SKILL_PREVIEW_COUNT
                        } more)`}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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

  scrollContainer: {
    padding: 15,
    paddingBottom: 40,
  },

  summaryCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    elevation: 3,
    marginBottom: 12,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1B457C",
    marginBottom: 4,
  },
  summaryText: {
    fontSize: 14,
    color: "#555",
    marginBottom: 8,
  },
  summaryHighlight: {
    fontWeight: "700",
    color: "#4a5fd4ff",
  },

  skillBarContainer: {
    marginTop: 4,
  },
  skillBarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  skillBarLabel: {
    fontSize: 12,
    color: "#4a5fd4ff",
    fontWeight: "600",
  },
  skillBarBackground: {
    height: 10,
    borderRadius: 5,
    backgroundColor: "#d0d7ff",
    overflow: "hidden",
  },
  skillBarFill: {
    height: "100%",
    borderRadius: 5,
    backgroundColor: "#4a5fd4ff",
  },

  sectionCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    elevation: 3,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1B457C",
  },
  sectionSubtitle: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
    marginBottom: 8,
  },

  chipContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 2,
  },

  haveChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: "#d4f5dd",
    marginRight: 6,
    marginTop: 6,
  },
  haveChipText: {
    fontSize: 12,
    color: "#1c7c3b",
  },

  missingChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: "#fde8e8ff",
    marginRight: 6,
    marginTop: 6,
  },
  missingChipText: {
    fontSize: 12,
    color: "#ff0000ff",
  },

  domainChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: "#e3f0ff",
    marginRight: 6,
    marginTop: 6,
  },
  domainChipText: {
    fontSize: 12,
    color: "#1B457C",
  },

  emptyText: {
    textAlign: "left",
    color: "#888",
    marginTop: 6,
    fontSize: 13,
  },

  viewMoreButton: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#90a5f9ff",
    backgroundColor: "#eef3ffff",
  },
  viewMoreText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4a5fd4ff",
  },
});
