import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import LottieView from "lottie-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../firebaseConfig";
import { jobs } from "../model/dataType";

type RecommendedJob = {
  job_id: string;
  job_title: string;
  category?: string;
  match_percent: number;
  matched_skills: string[];
};

export default function Homepage() {
  const BACKEND_BASE_URL = `http://${process.env.EXPO_PUBLIC_API_IP || "localhost"}:5000/recommend`;
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  const [jobList, setJobList] = useState<jobs[]>([]);
  const [recommendedJobs, setRecommendedJobs] = useState<RecommendedJob[]>([]);
  const [predictedCategory, setPredictedCategory] = useState<string | null>(
    null
  );
  const [loadingRecommend, setLoadingRecommend] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;

  const scrollRef = useRef<ScrollView | null>(null);
  const [otherCareerY, setOtherCareerY] = useState(0);

  // 🔵 FILTER STATE (chips for category + input for location)
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [locationInput, setLocationInput] = useState("");

  const handleOtherCareerLayout = (
    e: NativeSyntheticEvent<LayoutChangeEvent["nativeEvent"]>
  ) => {
    setOtherCareerY(e.nativeEvent.layout.y);
  };

  const scrollToTopOfJobs = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ y: otherCareerY, animated: true });
    }
  };

  useEffect(() => {
    const backAction = () => true;
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );
    return () => backHandler.remove();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "job"), (snapshot) => {
      const jobData = snapshot.docs.map((doc) => ({
        job_id: doc.id,
        ...doc.data(),
      })) as jobs[];

      setJobList(jobData);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchUserProfileAndRecommend = async () => {
      const user = auth.currentUser;
      if (!user) {
        setLoadingRecommend(false);
        return;
      }

      try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          setHasProfile(false);
          setLoadingRecommend(false);
          return;
        }

        const userData = userSnap.data() as any;

        if (!userData.educationId || !userData.profile_ids) {
          setHasProfile(false);
          setLoadingRecommend(false);
          return;
        }

        const eduSnap = await getDoc(
          doc(db, "education", userData.educationId)
        );
        const profileSnap = await getDoc(
          doc(db, "skillProfile", userData.profile_ids)
        );

        if (!eduSnap.exists() || !profileSnap.exists()) {
          setHasProfile(false);
          setLoadingRecommend(false);
          return;
        }

        setHasProfile(true);

        const edu = eduSnap.data() as any;
        const profile = profileSnap.data() as any;

        const skills: string[] = profile.skills || [];
        const field_of_study: string = edu.field_of_study || "";

        const payload = {
          skills: skills.map((s) => s.toLowerCase()),
          field_of_study,
        };

        const res = await fetch(BACKEND_BASE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const json = await res.json();
        console.log("Recommend API response:", json);

        if (json.status === "success") {
          setPredictedCategory(json.predicted_category || null);
          setRecommendedJobs(json.recommendations || []);
        } else {
          setPredictedCategory(null);
          setRecommendedJobs([]);
        }
      } catch (err) {
        console.error("Error in recommendation:", err);
        setPredictedCategory(null);
        setRecommendedJobs([]);
      } finally {
        setLoadingRecommend(false);
      }
    };

    fetchUserProfileAndRecommend();
  }, []);

  // reset page when filters/search change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, selectedLocation]);

  // helper: category + location for recommended jobs
  const getCategoryForRecommendedJob = (job: RecommendedJob): string | null => {
    if (job.category) return job.category;
    const docJob = jobList.find((j) => j.job_id === job.job_id) as any;
    return (docJob && (docJob.job_category as string)) || null;
  };

  const getLocationForRecommendedJob = (job: RecommendedJob): string | null => {
    const docJob = jobList.find((j) => j.job_id === job.job_id) as any;
    return (docJob && (docJob.job_location as string)) || null;
  };

  // unique categories (for chips)
  const allCategories = useMemo(() => {
    const set = new Set<string>();

    jobList.forEach((j: any) => {
      if (j.job_category) {
        set.add(String(j.job_category));
      }
    });

    recommendedJobs.forEach((r) => {
      const cat = getCategoryForRecommendedJob(r);
      if (cat) set.add(cat);
    });

    return Array.from(set).sort();
  }, [jobList, recommendedJobs]);

  //unique locations (for suggestion list)
  const allLocations = useMemo(() => {
    const set = new Set<string>();

    jobList.forEach((j: any) => {
      if (j.job_location) {
        set.add(String(j.job_location));
      }
    });

    recommendedJobs.forEach((r) => {
      const loc = getLocationForRecommendedJob(r);
      if (loc) set.add(loc);
    });

    return Array.from(set).sort();
  }, [jobList, recommendedJobs]);

  // suggestions for location input – we KEEP them visible as long as input has text
  const filteredLocationSuggestions = useMemo(() => {
    if (!locationInput.trim()) return [];
    const lower = locationInput.toLowerCase();
    return allLocations
      .filter((loc) => loc.toLowerCase().includes(lower))
      .slice(0, 10);
  }, [locationInput, allLocations]);

  const recommendedIds = new Set(recommendedJobs.map((job) => job.job_id));
  const otherJobs = jobList.filter((job) => !recommendedIds.has(job.job_id));

  const normalizedQuery = searchQuery.trim().toLowerCase();

  //filter recommended jobs by category + location
  const categoryAndLocationFilteredRecommended = recommendedJobs.filter(
    (job) => {
      const cat = getCategoryForRecommendedJob(job);
      const loc = getLocationForRecommendedJob(job);

      const matchCategory =
        !selectedCategory || (cat && cat === selectedCategory);
      const matchLocation =
        !selectedLocation ||
        (loc && loc.toLowerCase().includes(selectedLocation.toLowerCase()));

      return matchCategory && matchLocation;
    }
  );

  const filteredRecommendedJobs =
    normalizedQuery === ""
      ? categoryAndLocationFilteredRecommended
      : categoryAndLocationFilteredRecommended.filter((job) => {
          const title = job.job_title?.toLowerCase() || "";
          const skillsText = (job.matched_skills || []).join(" ").toLowerCase();

          return (
            title.includes(normalizedQuery) ||
            skillsText.includes(normalizedQuery)
          );
        });

  //For Other Jobs: text + category + location
  const textFilteredOtherJobs =
    normalizedQuery === ""
      ? otherJobs
      : otherJobs.filter((job: any) => {
          const name = job.job_name?.toLowerCase() || "";
          const company = job.company_name?.toLowerCase() || "";
          const type = job.job_type?.toLowerCase() || "";
          const location = job.job_location?.toLowerCase() || "";
          return (
            name.includes(normalizedQuery) ||
            company.includes(normalizedQuery) ||
            type.includes(normalizedQuery) ||
            location.includes(normalizedQuery)
          );
        });

  const filteredOtherJobs = textFilteredOtherJobs.filter((job: any) => {
    const cat = job.job_category as string | undefined;
    const loc = job.job_location as string | undefined;

    const matchCategory =
      !selectedCategory || (cat && cat === selectedCategory);
    const matchLocation =
      !selectedLocation ||
      (loc && loc.toLowerCase().includes(selectedLocation.toLowerCase()));

    return matchCategory && matchLocation;
  });

  const totalPages = Math.max(
    1,
    Math.ceil(filteredOtherJobs.length / PAGE_SIZE)
  );
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const paginatedOtherJobs = filteredOtherJobs.slice(
    startIndex,
    startIndex + PAGE_SIZE
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const getJobLogoById = (jobId: string): string | undefined => {
    const job = jobList.find((j) => j.job_id === jobId);
    return job?.company_logo;
  };

  // 🔵 Apply & Clear filter
  const handleApplyFilter = () => {
    // category is already controlled by chips
    setSelectedLocation(locationInput.trim() || null);
    setIsFilterOpen(false);
  };

  const handleClearFilter = () => {
    setSelectedCategory(null);
    setSelectedLocation(null);
    setLocationInput("");
    setIsFilterOpen(false);
  };

  const openFilterPanel = () => {
    setLocationInput(selectedLocation || "");
    setIsFilterOpen(true);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#d9efffff" }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headContainer}>
          <View style={styles.animationbox}>
            <LottieView
              source={require("../../assets/welcome.json")}
              autoPlay
              loop
              style={{ width: 130, height: 130 }}
            />
            <Text style={styles.headerTitle}>Careers</Text>
          </View>
        </View>

        <View style={styles.container}>
          {/* 🔍 Search + filter row */}
          <View style={styles.searchContainer}>
            <Ionicons
              name="search"
              size={20}
              color="#777"
              style={styles.searchIcon}
            />
            <TextInput
              style={styles.searchInput}
              placeholder="Career search"
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <TouchableOpacity
              style={styles.filterButton}
              onPress={openFilterPanel}
            >
              <Ionicons name="options-outline" size={20} color="#4a5fd4ff" />
            </TouchableOpacity>
          </View>

          {/* 🔵 FILTER PANEL: category chips + location input */}
          {isFilterOpen && (
            <View style={styles.filterPanel}>
              <Text style={styles.filterTitle}>Filter careers</Text>

              {/* Category chips */}
              <Text style={styles.filterLabel}>Job Category</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.categoryScroll}
              >
                <TouchableOpacity
                  style={[
                    styles.categoryChip,
                    selectedCategory === null && styles.categoryChipActive,
                  ]}
                  onPress={() => setSelectedCategory(null)}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      selectedCategory === null &&
                        styles.categoryChipTextActive,
                    ]}
                  >
                    All
                  </Text>
                </TouchableOpacity>

                {allCategories.map((cat) => {
                  const isActive = selectedCategory === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.categoryChip,
                        isActive && styles.categoryChipActive,
                      ]}
                      onPress={() => setSelectedCategory(isActive ? null : cat)}
                    >
                      <Text
                        style={[
                          styles.categoryChipText,
                          isActive && styles.categoryChipTextActive,
                        ]}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Location input + suggestions (stay visible after typing) */}
              <Text style={[styles.filterLabel, { marginTop: 8 }]}>
                Location
              </Text>
              <TextInput
                style={styles.filterInput}
                placeholder="e.g. Kuala Lumpur, Penang"
                placeholderTextColor="#999"
                value={locationInput}
                onChangeText={setLocationInput}
              />
              {filteredLocationSuggestions.length > 0 && (
                <View style={styles.suggestionBox}>
                  <ScrollView keyboardShouldPersistTaps="handled">
                    {filteredLocationSuggestions.map((loc) => (
                      <TouchableOpacity
                        key={loc}
                        style={styles.suggestionItem}
                        onPress={() => {
                          // fill input BUT keep suggestion box (because it still matches)
                          setLocationInput(loc);
                        }}
                      >
                        <Text style={styles.suggestionText}>{loc}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Buttons */}
              <View style={styles.filterButtonRow}>
                <TouchableOpacity
                  style={[styles.filterActionBtn, styles.filterClearBtn]}
                  onPress={handleClearFilter}
                >
                  <Text style={styles.filterClearText}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterActionBtn, styles.filterApplyBtn]}
                  onPress={handleApplyFilter}
                >
                  <Text style={styles.filterApplyText}>Apply</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* AI predicted focus */}
          {hasProfile && !loadingRecommend && predictedCategory && (
            <View style={styles.predictedBox}>
              <Text style={styles.predictedLabel}>
                AI-predicted career focus
              </Text>
              <Text style={styles.predictedCategory}>{predictedCategory}</Text>
              <Text style={styles.predictedHint}>
                Based on your skills and field of study
              </Text>
            </View>
          )}

          <Text style={styles.subheader}>
            ------ Recommended Careers ------
          </Text>

          {!hasProfile ? (
            <Text
              style={{ color: "#a69d9dff", textAlign: "center", fontSize: 16 }}
            >
              Complete your profile first to see recommendations.
            </Text>
          ) : loadingRecommend ? (
            <ActivityIndicator style={{ marginTop: 10 }} />
          ) : filteredRecommendedJobs.length === 0 ? (
            <Text
              style={{ color: "#a69d9dff", textAlign: "center", fontSize: 16 }}
            >
              No recommended jobs found yet.
            </Text>
          ) : (
            <>
              {filteredRecommendedJobs.map((item) => {
                const logoUri = getJobLogoById(item.job_id);
                const catLabel = getCategoryForRecommendedJob(item);

                return (
                  <TouchableOpacity
                    key={item.job_id}
                    style={styles.box}
                    onPress={() =>
                      router.push({
                        pathname: "../job-seeker-page/jobInformation",
                        params: { id: item.job_id },
                      })
                    }
                  >
                    <Image
                      source={
                        logoUri
                          ? { uri: logoUri }
                          : require("../../assets/images/logo.png")
                      }
                      style={styles.companyLogo}
                    />
                    <View style={styles.textContainer}>
                      <Text style={styles.jobTitle}>{item.job_title}</Text>
                      {catLabel && (
                        <Text style={styles.companyName}>
                          Category: {catLabel}
                        </Text>
                      )}
                      <Text style={styles.jobType}>
                        Match: {item.match_percent}%
                      </Text>
                      {item.matched_skills &&
                        item.matched_skills.length > 0 && (
                          <Text style={styles.location}>
                            Matched skills: {item.matched_skills.join(", ")}
                          </Text>
                        )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </>
          )}

          <Text style={styles.subheader} onLayout={handleOtherCareerLayout}>
            ----------- Other Career -----------
          </Text>

          {paginatedOtherJobs.length === 0 ? (
            <Text
              style={{ color: "#a69d9dff", textAlign: "center", fontSize: 16 }}
            >
              No jobs found.
            </Text>
          ) : (
            <>
              {paginatedOtherJobs.map((item: any) => (
                <TouchableOpacity
                  key={item.job_id}
                  style={styles.box}
                  onPress={() =>
                    router.push({
                      pathname: "../job-seeker-page/jobInformation",
                      params: { id: item.job_id },
                    })
                  }
                >
                  <Image
                    source={
                      item.company_logo
                        ? { uri: item.company_logo }
                        : require("../../assets/images/logo.png")
                    }
                    style={styles.companyLogo}
                  />
                  <View style={styles.textContainer}>
                    <Text style={styles.jobTitle}>{item.job_name}</Text>
                    <Text style={styles.companyName}>{item.company_name}</Text>
                    {item.job_category && (
                      <Text style={styles.jobType}>
                        Category: {item.job_category}
                      </Text>
                    )}
                    <Text style={styles.jobType}>{item.job_type}</Text>
                    <Text style={styles.location}>{item.job_location}</Text>
                    <Text style={styles.salary}>Salary: {item.job_salary}</Text>
                  </View>
                </TouchableOpacity>
              ))}

              {totalPages > 1 && (
                <View style={styles.paginationContainer}>
                  <TouchableOpacity
                    style={[
                      styles.arrowButton,
                      currentPage === 1 && styles.disabledArrow,
                    ]}
                    disabled={currentPage === 1}
                    onPress={() => {
                      if (currentPage > 1) {
                        setCurrentPage((prev) => prev - 1);
                        scrollToTopOfJobs();
                      }
                    }}
                  >
                    <Text style={styles.arrowText}>{"<"}</Text>
                  </TouchableOpacity>

                  {(() => {
                    const maxVisiblePages = 6;
                    let startPage = Math.max(
                      1,
                      currentPage - Math.floor(maxVisiblePages / 2)
                    );
                    let endPage = startPage + maxVisiblePages - 1;

                    if (endPage > totalPages) {
                      endPage = totalPages;
                      startPage = Math.max(1, endPage - maxVisiblePages + 1);
                    }

                    const pages: number[] = [];
                    for (let p = startPage; p <= endPage; p++) pages.push(p);

                    return pages.map((page) => {
                      const isActive = page === currentPage;
                      return (
                        <TouchableOpacity
                          key={page}
                          style={[
                            styles.pageButton,
                            isActive && styles.pageButtonActive,
                          ]}
                          onPress={() => {
                            setCurrentPage(page);
                            scrollToTopOfJobs();
                          }}
                        >
                          <Text
                            style={[
                              styles.pageButtonText,
                              isActive && styles.pageButtonTextActive,
                            ]}
                          >
                            {page}
                          </Text>
                        </TouchableOpacity>
                      );
                    });
                  })()}

                  <TouchableOpacity
                    style={[
                      styles.arrowButton,
                      currentPage === totalPages && styles.disabledArrow,
                    ]}
                    disabled={currentPage === totalPages}
                    onPress={() => {
                      if (currentPage < totalPages) {
                        setCurrentPage((prev) => prev + 1);
                        scrollToTopOfJobs();
                      }
                    }}
                  >
                    <Text style={styles.arrowText}>{">"}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: { paddingBottom: 100 },
  headContainer: {
    marginTop: 50,
    padding: 15,
  },
  container: {
    paddingLeft: 10,
    paddingRight: 10,
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
  subheader: {
    color: "#4a5fd4ff",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 15,
    textAlign: "center",
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
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  filterButton: {
    marginLeft: 8,
    padding: 4,
  },

  // FILTER PANEL
  filterPanel: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: "#aec5ffff",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  filterTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1B457C",
    marginBottom: 6,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4a5fd4ff",
    marginTop: 4,
  },
  filterInput: {
    borderWidth: 1.5,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    backgroundColor: "#f9fafb",
    marginTop: 4,
  },
  suggestionBox: {
    marginTop: 4,
    maxHeight: 140,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  suggestionItem: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  suggestionText: {
    fontSize: 14,
    color: "#111827",
  },
  filterButtonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 10,
  },
  filterActionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginLeft: 8,
  },
  filterClearBtn: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#ffffff",
  },
  filterApplyBtn: {
    backgroundColor: "#4a5fd4ff",
  },
  filterClearText: {
    fontSize: 13,
    color: "#4b5563",
    fontWeight: "600",
  },
  filterApplyText: {
    fontSize: 13,
    color: "#ffffff",
    fontWeight: "700",
  },

  // category chips inside filter panel
  categoryScroll: {
    marginTop: 6,
  },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#7b9ef6ff",
    marginRight: 8,
    backgroundColor: "#ffffff",
  },
  categoryChipActive: {
    backgroundColor: "#4a5fd4ff",
    borderColor: "#4a5fd4ff",
  },
  categoryChipText: {
    fontSize: 13,
    color: "#4a5fd4ff",
    fontWeight: "500",
  },
  categoryChipTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },

  // predicted card
  predictedBox: {
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#e7eeffff",
    borderWidth: 1.5,
    borderColor: "#7b9ef6ff",
  },
  predictedLabel: {
    fontSize: 14,
    color: "#4a5fd4ff",
    fontWeight: "600",
  },
  predictedCategory: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1B457C",
    marginTop: 4,
  },
  predictedHint: {
    fontSize: 12,
    color: "#6f6f6fff",
    marginTop: 2,
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
    height: 65,
    width: 65,
    marginRight: 20,
    borderRadius: 5,
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
    fontSize: 16,
    color: "#5c7ce6ff",
    marginTop: 4,
    fontWeight: "600",
  },
  jobType: {
    fontSize: 15,
    color: "#6f6f6fff",
    marginTop: 2,
    fontWeight: "500",
  },
  location: {
    fontSize: 14,
    color: "#8b8b8b",
    marginTop: 2,
    fontWeight: "500",
  },
  salary: {
    fontSize: 15,
    color: "#8b8b8b",
    marginTop: 2,
  },

  paginationContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 16,
    marginBottom: 8,
    flexWrap: "wrap",
  },
  pageButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginHorizontal: 4,
    marginVertical: 2,
  },
  pageButtonActive: {
    backgroundColor: "#4a5fd4ff",
  },
  pageButtonText: {
    fontSize: 14,
    color: "#4a5fd4ff",
    fontWeight: "500",
  },
  pageButtonTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },
  arrowButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginHorizontal: 4,
    marginVertical: 2,
  },
  disabledArrow: {
    opacity: 0.4,
  },
  arrowText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#4a5fd4ff",
  },
});
