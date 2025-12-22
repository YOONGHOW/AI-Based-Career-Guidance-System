import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  Alert,
  BackHandler,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db } from "../../firebaseConfig";

type CareerItem = {
  company: string;
  position: string;
  description: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
};

type DatePickerConfig = {
  index: number;
  field: "startDate" | "endDate";
};

export default function EditCareerHistory() {
  const router = useRouter();

  const [careerList, setCareerList] = useState<CareerItem[]>([
    {
      company: "",
      position: "",
      description: "",
      startDate: "",
      endDate: "",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [hasExisting, setHasExisting] = useState(false); // 👈 new: track if user already has data

  const [datePickerConfig, setDatePickerConfig] =
    useState<DatePickerConfig | null>(null);
  const [tempDate, setTempDate] = useState<Date>(new Date());

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
    const loadCareerHistory = async () => {
      try {
        setLoading(true);
        const user = auth.currentUser;

        if (!user) {
          Alert.alert("Error", "User data not found");
          return;
        }

        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          Alert.alert("Error", "User data not found");
          return;
        }

        const userData = userSnap.data() || {};
        const careerHisId = userData.careerHistory_id;

        if (!careerHisId) {
          setHasExisting(false);
          return;
        }

        const careerDocRef = doc(db, "career_history", careerHisId);
        const careerDocSnap = await getDoc(careerDocRef);

        if (careerDocSnap.exists()) {
          const data = careerDocSnap.data();
          const careersRaw = (data.careers || []) as any[];

          if (careersRaw.length > 0) {
            const careers: CareerItem[] = careersRaw.map((c) => ({
              company: c.company || "",
              position: c.position || "",
              description: c.description || "",
              startDate: c.startDate || c.start_date || "",
              endDate: c.endDate || c.end_date || "",
            }));
            setCareerList(careers);
            setHasExisting(true); // ✅ we are in update mode
          } else {
            setHasExisting(false);
          }
        } else {
          setHasExisting(false);
        }
      } catch (error) {
        console.error("Error loading career history:", error);
        Alert.alert("Error", "Failed to load career history.");
      } finally {
        setLoading(false);
      }
    };

    loadCareerHistory();
  }, []);

  const handleAddBox = () => {
    if (careerList.length >= 5) {
      Alert.alert("Limit Reached", "You can only add up to 5 career records.");
      return;
    }

    setCareerList((prev) => [
      ...prev,
      {
        company: "",
        position: "",
        description: "",
        startDate: "",
        endDate: "",
      },
    ]);
  };

  const handleDeleteBox = (index: number) => {
    setCareerList((prev) => {
      const updated = [...prev];
      updated.splice(index, 1);
      if (updated.length === 0) {
        return [
          {
            company: "",
            position: "",
            description: "",
            startDate: "",
            endDate: "",
          },
        ];
      }
      return updated;
    });
  };

  const isValidDateFormat = (value: string) => {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    return regex.test(value.trim());
  };

  const isValidDateOrder = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return false;
    return startDate.getTime() <= endDate.getTime();
  };

  const isFutureDate = (dateStr: string) => {
    const today = new Date();
    const d = new Date(dateStr);
    return d.getTime() > today.getTime();
  };

  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const parseDateOrToday = (value: string) => {
    if (value && isValidDateFormat(value)) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  };

  const openDatePicker = (index: number, field: "startDate" | "endDate") => {
    const item = careerList[index];
    const currentValue = item[field];
    const d = parseDateOrToday(currentValue);
    setTempDate(d);
    setDatePickerConfig({ index, field });
  };

  const onDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (!datePickerConfig) return;

    if (event.type === "dismissed") {
      setDatePickerConfig(null);
      return;
    }

    const chosenDate = selected || tempDate;
    const formatted = formatDate(chosenDate);

    setCareerList((prev) => {
      const updated = [...prev];
      updated[datePickerConfig.index][datePickerConfig.field] = formatted;
      return updated;
    });

    if (Platform.OS === "android") {
      setDatePickerConfig(null);
    } else {
      setTempDate(chosenDate);
    }
  };

  const handleUpdateCareer = async () => {
    if (loading) return;

    const user = auth.currentUser;

    if (!user) {
      Alert.alert("Error", "User data not found");
      return;
    }

    try {
      setLoading(true);

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        Alert.alert("Error", "User data not found");
        return;
      }

      const userData = userSnap.data() || {};
      const existingCareerHisId = userData.careerHistory_id as
        | string
        | undefined;

      const cleanedCareerList = careerList.filter(
        (c) =>
          c.company.trim() ||
          c.position.trim() ||
          c.description.trim() ||
          c.startDate.trim() ||
          c.endDate.trim()
      );

      // 🔹 NEW: allow full delete when user clears all career items
      if (cleanedCareerList.length === 0) {
        if (existingCareerHisId) {
          // user previously had career history -> delete it
          const careerDocRef = doc(db, "career_history", existingCareerHisId);
          await deleteDoc(careerDocRef);

          // remove the link from user document
          await updateDoc(userRef, {
            careerHistory_id: deleteField(),
          });

          setHasExisting(false);
          Alert.alert("Success", "Career history deleted successfully.");
          router.push("/(job-seekerTabs)/profile");
          return;
        } else {
          // no existing record, nothing to save
          Alert.alert("Error", "Please fill in at least one career item.");
          return;
        }
      }

      // Validation
      for (let i = 0; i < cleanedCareerList.length; i++) {
        const item = cleanedCareerList[i];
        const indexLabel = i + 1;

        if (!item.company.trim()) {
          Alert.alert(
            "Validation Error",
            `Please enter Company Name for career item ${indexLabel}.`
          );
          return;
        }
        if (!item.position.trim()) {
          Alert.alert(
            "Validation Error",
            `Please enter Position for career item ${indexLabel}.`
          );
          return;
        }
        if (!item.description.trim()) {
          Alert.alert(
            "Validation Error",
            `Please enter Description for career item ${indexLabel}.`
          );
          return;
        }
        if (!item.startDate.trim()) {
          Alert.alert(
            "Validation Error",
            `Please enter Start Date for career item ${indexLabel}.`
          );
          return;
        }
        if (!isValidDateFormat(item.startDate)) {
          Alert.alert(
            "Validation Error",
            `Start Date for career item ${indexLabel} must be in YYYY-MM-DD format.`
          );
          return;
        }
        if (isFutureDate(item.startDate)) {
          Alert.alert(
            "Validation Error",
            `Start Date for Career ${indexLabel} cannot be in the future.`
          );
          return;
        }
        if (!item.endDate.trim()) {
          Alert.alert(
            "Validation Error",
            `Please enter End Date for career item ${indexLabel}.`
          );
          return;
        }
        if (!isValidDateFormat(item.endDate)) {
          Alert.alert(
            "Validation Error",
            `End Date for career item ${indexLabel} must be in YYYY-MM-DD format.`
          );
          return;
        }
        if (!isValidDateOrder(item.startDate, item.endDate)) {
          Alert.alert(
            "Validation Error",
            `For career item ${indexLabel}, Start Date cannot be after End Date.`
          );
          return;
        }
      }

      if (!existingCareerHisId) {
        const careerHisDocRef = doc(collection(db, "career_history"));
        const careerHisId = careerHisDocRef.id;

        const data = {
          career_id: careerHisId,
          userId: user.uid,
          careers: cleanedCareerList,
        };

        await setDoc(careerHisDocRef, data);
        await updateDoc(userRef, { careerHistory_id: careerHisId });

        Alert.alert("Success", "Career history saved successfully!");
      } else {
        const careerDocRef = doc(db, "career_history", existingCareerHisId);
        await updateDoc(careerDocRef, { careers: cleanedCareerList });
        Alert.alert("Success", "Career history updated successfully!");
      }

      router.push("/(job-seekerTabs)/profile");
    } catch (error) {
      console.error("Error saving career history:", error);
      Alert.alert("Error", "Failed to save career history.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#d9efffff" }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.replace("/(job-seekerTabs)/profile")}
          >
            <Ionicons name="arrow-back" size={24} color="black" />
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.headerTitle}>Career History</Text>
          </View>

          {careerList.map((item, index) => (
            <View key={index} style={styles.box}>
              <View style={styles.boxHeaderRow}>
                <Text style={styles.boxTitle}>Career {index + 1}</Text>

                {index === 0 ? (
                  <TouchableOpacity
                    onPress={() => {
                      const updated = [...careerList];
                      updated[0] = {
                        company: "",
                        position: "",
                        description: "",
                        startDate: "",
                        endDate: "",
                      };
                      setCareerList(updated);
                    }}
                    style={styles.clearChip}
                  >
                    <Ionicons
                      name="refresh-outline"
                      size={16}
                      color="#1B457C"
                    />
                    <Text style={styles.clearChipText}>Clear</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={() => handleDeleteBox(index)}
                    style={styles.deleteChip}
                  >
                    <Ionicons name="trash-outline" size={16} color="#FF4C4C" />
                    <Text style={styles.deleteChipText}>Delete</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.label}>Company Name:</Text>
              <TextInput
                placeholder="Enter your company name"
                style={styles._textInput}
                value={item.company}
                onChangeText={(text) => {
                  const updated = [...careerList];
                  updated[index].company = text;
                  setCareerList(updated);
                }}
              />

              <Text style={styles.label}>Position:</Text>
              <TextInput
                placeholder="Enter your position"
                style={styles._textInput}
                value={item.position}
                onChangeText={(text) => {
                  const updated = [...careerList];
                  updated[index].position = text;
                  setCareerList(updated);
                }}
              />

              <Text style={styles.label}>Description:</Text>
              <TextInput
                placeholder="Enter your work description"
                style={[styles._textInput, { height: 80 }]}
                multiline
                value={item.description}
                onChangeText={(text) => {
                  const updated = [...careerList];
                  updated[index].description = text;
                  setCareerList(updated);
                }}
              />

              <Text style={styles.label}>Start Date:</Text>
              <TouchableOpacity
                style={styles.dateInput}
                onPress={() => openDatePicker(index, "startDate")}
              >
                <Text
                  style={
                    item.startDate ? styles.dateText : styles.datePlaceholder
                  }
                >
                  {item.startDate || "Select start date"}
                </Text>
                <Ionicons name="calendar-outline" size={18} color="#1B457C" />
              </TouchableOpacity>

              <Text style={styles.label}>End Date:</Text>
              <TouchableOpacity
                style={styles.dateInput}
                onPress={() => openDatePicker(index, "endDate")}
              >
                <Text
                  style={
                    item.endDate ? styles.dateText : styles.datePlaceholder
                  }
                >
                  {item.endDate || "Select end date"}
                </Text>
                <Ionicons name="calendar-outline" size={18} color="#1B457C" />
              </TouchableOpacity>
            </View>
          ))}

          {careerList.length < 5 && (
            <TouchableOpacity style={[styles.addButton]} onPress={handleAddBox}>
              <Ionicons
                name="add-circle-outline"
                size={20}
                color="#1B457C"
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.addButtonText]}>
                Add another career record
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.btnNext}
            onPress={handleUpdateCareer}
            disabled={loading}
          >
            <Text style={styles.btnText}>
              {loading
                ? "Saving..."
                : hasExisting
                ? "Update Career History"
                : "Save Career History"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {datePickerConfig && (
        <DateTimePicker
          value={tempDate}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={onDateChange}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    flex: 1,
  },
  clearChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: "#e6f1ff",
  },
  clearChipText: {
    marginLeft: 4,
    fontSize: 12,
    fontWeight: "600",
    color: "#1B457C",
  },

  backBtn: {
    position: "absolute",
    top: 40,
    left: 20,
    padding: 8,
    zIndex: 10,
  },

  header: {
    marginVertical: 25,
    marginTop: 60,
  },
  headerTitle: {
    color: "#8BA0FF",
    fontSize: 27,
    fontWeight: "700",
    textAlign: "center",
  },
  headerSubtitle: {
    marginTop: 6,
    textAlign: "center",
    fontSize: 13,
    color: "#4b5f8f",
  },
  box: {
    width: "100%",
    padding: 25,
    borderRadius: 12,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 4,
    marginBottom: 25,
  },
  boxHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  boxTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1B457C",
  },
  deleteChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: "#ffecec",
  },
  deleteChipText: {
    marginLeft: 4,
    fontSize: 12,
    fontWeight: "600",
    color: "#FF4C4C",
  },
  label: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1B457C",
    marginTop: 8,
  },
  _textInput: {
    marginBottom: 6,
    marginTop: 6,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#7b9ef6ff",
    fontSize: 16,
    padding: 10,
    backgroundColor: "#f9fbff",
  },
  dateInput: {
    marginTop: 6,
    marginBottom: 6,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#7b9ef6ff",
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "#f9fbff",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dateText: {
    fontSize: 16,
    color: "#1B457C",
  },
  datePlaceholder: {
    fontSize: 16,
    color: "#999",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  addButtonText: {
    fontSize: 15,
    color: "#1B457C",
    fontWeight: "500",
  },
  btnNext: {
    padding: 12,
    borderWidth: 2,
    borderColor: "#7b9ef6ff",
    borderRadius: 30,
    width: "75%",
    alignSelf: "center",
    marginVertical: 25,
    backgroundColor: "#e7eeffff",
  },
  btnText: {
    textAlign: "center",
    fontSize: 18,
    fontWeight: "600",
    color: "#1B457C",
  },
});
