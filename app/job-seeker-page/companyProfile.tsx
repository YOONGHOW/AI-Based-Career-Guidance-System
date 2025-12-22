import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../../firebaseConfig";

type Company = {
  company_id: string;
  name?: string;
  description?: string;
  detailed_desc?: string;
  website?: string;
  company_profile_link?: string;
  logo?: string;
  company_logo?: string;
  types?: string[];
  location?: string; // from KG (optional)
};

type CompanyJob = {
  job_id: string;
  job_name?: string;
  job_location?: string;
  job_type?: string;
  job_salary?: string;
  company_logo?: string;
};

export default function CompanyProfile() {
  const router = useRouter();
  const { companyId, companyName } = useLocalSearchParams();
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  const [companyJobs, setCompanyJobs] = useState<CompanyJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);

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
  // ===== Fetch company document =====
  useEffect(() => {
    const fetchCompany = async () => {
      if (!companyId) {
        Alert.alert("Error", "Company ID is missing.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const ref = doc(db, "company", companyId as string);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          Alert.alert(
            "Company not found",
            "This company doesn't have a profile yet."
          );
          setCompany(null);
          return;
        }

        const data = snap.data() || {};
        setCompany({ company_id: snap.id, ...data } as Company);
      } catch (err) {
        console.error("Error fetching company:", err);
        Alert.alert("Error", "Failed to load company profile.");
      } finally {
        setLoading(false);
      }
    };

    fetchCompany();
  }, [companyId]);

  // ===== Fetch jobs under this company (from job collection) =====
  useEffect(() => {
    const fetchJobs = async () => {
      if (!companyId) {
        setCompanyJobs([]);
        setJobsLoading(false);
        return;
      }

      try {
        setJobsLoading(true);
        const qRef = query(
          collection(db, "job"),
          where("company_id", "==", companyId as string)
        );
        const snapshot = await getDocs(qRef);

        const list = snapshot.docs.map((d) => {
          const data = d.data() || {};
          return {
            job_id: d.id,
            job_name: data.job_name,
            job_location: data.job_location,
            job_type: data.job_type,
            job_salary: data.job_salary,
            company_logo: data.company_logo,
          } as CompanyJob;
        });

        setCompanyJobs(list);
      } catch (err) {
        console.error("Error fetching company jobs:", err);
        setCompanyJobs([]);
      } finally {
        setJobsLoading(false);
      }
    };

    fetchJobs();
  }, [companyId]);

  const openUrlSafely = async (url?: string) => {
    if (!url) return;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert("Cannot open link", url);
      }
    } catch (e) {
      console.error("Error opening url:", e);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4a5fd4ff" />
        <Text style={{ marginTop: 8, color: "#6b6b6b" }}>
          Loading company profile...
        </Text>
      </View>
    );
  }

  if (!company) {
    return (
      <View style={styles.center}>
        <Text style={{ fontSize: 16, color: "#6b6b6b" }}>
          Company profile not available.
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.chipBtn, { marginTop: 16 }]}
        >
          <Ionicons name="arrow-back" size={18} color="#1B457C" />
          <Text style={styles.chipBtnText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const displayName = company.name || (companyName as string) || "Company";

  // 🔹 Use original job company logo first, then fall back to company doc, then app logo
  const primaryJobLogo = companyJobs[0]?.company_logo;
  const logoUri = primaryJobLogo || company.company_logo || company.logo;

  const shortDesc = company.description;
  const longDesc = company.detailed_desc;

  // 🔹 Collect unique locations from job collection
  const uniqueJobLocations = Array.from(
    new Set(
      companyJobs
        .map((j) => j.job_location)
        .filter((loc): loc is string => !!loc && loc.trim().length > 0)
    )
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#d9efffff" }}>
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
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
          <View style={styles.headerContainer}>
            <Image
              source={
                logoUri
                  ? { uri: logoUri }
                  : require("../../assets/images/logo.png")
              }
              style={styles.companyLogo}
            />
            <Text style={styles.companyTitle}>{displayName}</Text>

            {company.types && company.types.length > 0 && (
              <View style={styles.typeChipsContainer}>
                {company.types.slice(0, 3).map((t, idx) => (
                  <View key={idx} style={styles.typeChip}>
                    <Text style={styles.typeChipText}>{t}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.divider} />

          {/* DESCRIPTION */}
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.sectionTitle}>About the company</Text>
            {shortDesc ? (
              <Text style={styles.descriptionText}>{shortDesc}</Text>
            ) : (
              <Text style={styles.mutedText}>
                No short description available yet.
              </Text>
            )}

            {longDesc && longDesc !== shortDesc && (
              <Text style={[styles.descriptionText, { marginTop: 8 }]}>
                {longDesc}
              </Text>
            )}
          </View>

          <View style={styles.divider} />

          {/* LINKS */}
          <Text style={styles.sectionTitle}>Links</Text>
          <View style={{ marginTop: 8, gap: 10 }}>
            {company.website && (
              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => openUrlSafely(company.website)}
              >
                <Ionicons name="globe-outline" size={18} color="#1B457C" />
                <Text
                  style={styles.linkButtonText}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  Visit company website
                </Text>
              </TouchableOpacity>
            )}

            {company.company_profile_link && (
              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => openUrlSafely(company.company_profile_link)}
              >
                <MaterialIcons
                  name="business-center"
                  size={18}
                  color="#1B457C"
                />
                <Text
                  style={styles.linkButtonText}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  View on LinkedIn
                </Text>
              </TouchableOpacity>
            )}

            {!company.website && !company.company_profile_link && (
              <Text style={styles.mutedText}>
                No external links are available for this company yet.
              </Text>
            )}
          </View>

          {/* LOCATION from job collection (unique locations) */}
          {(uniqueJobLocations.length > 0 || company.location) && (
            <>
              <View style={styles.divider} />
              <Text style={styles.sectionTitle}>Location</Text>
              {uniqueJobLocations.length > 0 ? (
                uniqueJobLocations.map((loc, idx) => (
                  <Text key={idx} style={styles.descriptionText}>
                    • {loc}
                  </Text>
                ))
              ) : (
                <Text style={styles.descriptionText}>{company.location}</Text>
              )}
            </>
          )}

          {/* JOBS LIST FOR THIS COMPANY */}
          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>Open roles at this company</Text>

          {jobsLoading ? (
            <View style={{ marginTop: 8 }}>
              <ActivityIndicator size="small" color="#4a5fd4ff" />
              <Text style={{ marginTop: 4, color: "#8b8b8b" }}>
                Loading jobs...
              </Text>
            </View>
          ) : companyJobs.length === 0 ? (
            <Text style={styles.mutedText}>
              No jobs found for this company in the system yet.
            </Text>
          ) : (
            <View style={{ marginTop: 8 }}>
              {companyJobs.map((job) => (
                <TouchableOpacity
                  key={job.job_id}
                  style={styles.jobCard}
                  onPress={() =>
                    router.push({
                      pathname: "/job-seeker-page/jobInformation",
                      params: { id: job.job_id },
                    })
                  }
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.jobTitleText} numberOfLines={1}>
                      {job.job_name || "Job"}
                    </Text>
                    {job.job_location && (
                      <Text style={styles.jobMetaText} numberOfLines={1}>
                        <Ionicons
                          name="location-outline"
                          size={14}
                          color="#6b6b6b"
                        />{" "}
                        {job.job_location}
                      </Text>
                    )}
                    {job.job_type && (
                      <Text style={styles.jobMetaText} numberOfLines={1}>
                        <Ionicons
                          name="time-outline"
                          size={14}
                          color="#6b6b6b"
                        />{" "}
                        {job.job_type}
                      </Text>
                    )}
                  </View>
                  {job.job_salary && (
                    <Text style={styles.jobSalaryText} numberOfLines={1}>
                      {job.job_salary}
                    </Text>
                  )}
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
  backBtn: {
    position: "absolute",
    top: 40,
    left: 20,
    padding: 8,
    zIndex: 10,
  },
  scrollContainer: {
    marginTop: 50,
    padding: 10,
    paddingBottom: 80,
  },
  box: {
    width: "100%",
    padding: 16,
    borderRadius: 10,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 4,
  },
  center: {
    flex: 1,
    backgroundColor: "#d9efffff",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  headerContainer: {
    alignItems: "center",
    marginTop: 20,
    marginBottom: 8,
  },
  companyLogo: {
    height: 100,
    width: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: "#d0d0d0ff",
    marginBottom: 10,
    resizeMode: "contain",
  },
  companyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1B457C",
    textAlign: "center",
  },
  divider: {
    height: 2,
    backgroundColor: "#ccc",
    width: "100%",
    marginVertical: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1B457C",
    marginBottom: 4,
  },
  descriptionText: {
    fontSize: 14,
    color: "#6b6b6b",
    textAlign: "justify",
    lineHeight: 20,
  },
  mutedText: {
    fontSize: 13,
    color: "#8b8b8b",
  },

  typeChipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
    justifyContent: "center",
  },
  typeChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: "#e6f1ff",
    borderWidth: 1,
    borderColor: "#b5caffff",
    marginHorizontal: 4,
    marginBottom: 4,
  },
  typeChipText: {
    fontSize: 12,
    color: "#1B457C",
    fontWeight: "600",
  },

  linkButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: "#e6f1ff",
    borderWidth: 1,
    borderColor: "#b5caffff",
  },
  linkButtonText: {
    marginLeft: 8,
    fontSize: 14,
    color: "#1B457C",
    fontWeight: "600",
    flexShrink: 1,
  },

  chipBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "#e6f1ff",
    borderWidth: 1,
    borderColor: "#b5caffff",
  },
  chipBtnText: {
    marginLeft: 6,
    fontSize: 14,
    color: "#1B457C",
    fontWeight: "600",
  },

  // Jobs list
  jobCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#f5f7ff",
    borderWidth: 1,
    borderColor: "#d5e0ff",
    marginBottom: 8,
  },
  jobTitleText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1B457C",
  },
  jobMetaText: {
    fontSize: 13,
    color: "#6b6b6b",
    marginTop: 2,
  },
  jobSalaryText: {
    fontSize: 13,
    color: "#1B457C",
    fontWeight: "600",
    marginLeft: 8,
    maxWidth: 90,
    textAlign: "right",
  },
});
