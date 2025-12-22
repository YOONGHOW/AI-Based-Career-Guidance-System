import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { collection, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  Alert,
  BackHandler,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import languagesData from "../../assets/languages.json";
import { auth, db } from "../../firebaseConfig";

const LANGUAGE_OPTIONS = Array.from(
  new Set(
    (languagesData as any[]).map((item) => {
      return (
        item.name ||
        item.language ||
        item.Language ||
        item.LanguageName ||
        ""
      ).toString();
    })
  )
).filter((x) => x.trim().length > 0);

export default function EditLanguage() {
  const router = useRouter();

  const [languageInputs, setLanguageInputs] = useState<string[]>([""]);
  const [suggestions, setSuggestions] = useState<string[][]>([[]]);

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
    const fetchData = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;

        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data() || {};
        const languageId = userData.language_id;

        if (!languageId) return;

        const languageDocRef = doc(db, "language", languageId);
        const languageSnap = await getDoc(languageDocRef);

        if (languageSnap.exists()) {
          const data: any = languageSnap.data();
          const langs: string[] = [];

          if (data.language_1) langs.push(data.language_1);
          if (data.language_2) langs.push(data.language_2);
          if (data.language_3) langs.push(data.language_3);
          if (data.language_4) langs.push(data.language_4);
          if (data.language_5) langs.push(data.language_5);

          if (langs.length === 0) {
            setLanguageInputs([""]);
            setSuggestions([[]]);
          } else {
            setLanguageInputs(langs);
            setSuggestions(langs.map(() => []));
          }
        } else {
          console.log("Language document not found");
        }
      } catch (error) {
        console.log("Error:", error);
      }
    };

    fetchData();
  }, []);

  const getFilteredSuggestions = (text: string) => {
    if (!text.trim()) return [];
    const lower = text.toLowerCase();
    return LANGUAGE_OPTIONS.filter((lang) =>
      lang.toLowerCase().includes(lower)
    ).slice(0, 10);
  };

  const isValidLanguage = (value: string) => {
    if (!value.trim()) return true;
    return LANGUAGE_OPTIONS.some(
      (lang) => lang.toLowerCase() === value.trim().toLowerCase()
    );
  };

  const handleChangeLanguage = (index: number, text: string) => {
    const newInputs = [...languageInputs];
    newInputs[index] = text;
    setLanguageInputs(newInputs);

    const newSuggestions = [...suggestions];
    newSuggestions[index] = getFilteredSuggestions(text);
    setSuggestions(newSuggestions);
  };

  const handleFocusLanguage = (index: number) => {
    const current = languageInputs[index];
    if (!current) return;

    const newSuggestions = [...suggestions];
    newSuggestions[index] = getFilteredSuggestions(current);
    setSuggestions(newSuggestions);
  };

  const handleSelectSuggestion = (index: number, value: string) => {
    const newInputs = [...languageInputs];
    newInputs[index] = value;
    setLanguageInputs(newInputs);

    const newSuggestions = [...suggestions];
    newSuggestions[index] = [];
    setSuggestions(newSuggestions);

    Keyboard.dismiss();
  };

  const handleAddLanguageField = () => {
    if (languageInputs.length >= 5) return;
    setLanguageInputs([...languageInputs, ""]);
    setSuggestions([...suggestions, []]);
  };

  const handleRemoveLanguageField = (index: number) => {
    if (languageInputs.length === 1) {
      setLanguageInputs([""]);
      setSuggestions([[]]);
      return;
    }
    const newInputs = languageInputs.filter((_, i) => i !== index);
    const newSuggestions = suggestions.filter((_, i) => i !== index);
    setLanguageInputs(newInputs);
    setSuggestions(newSuggestions);
  };

  const handleUpdateLanguage = async () => {
    const user = auth.currentUser;

    if (!user) {
      Alert.alert("Error", "User data not found");
      return;
    }

    for (let i = 0; i < languageInputs.length; i++) {
      if (!isValidLanguage(languageInputs[i])) {
        Alert.alert(
          `Invalid Language ${i + 1}`,
          `Please select Language ${i + 1} from the suggestion list.`
        );
        return;
      }
    }

    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      Alert.alert("Error", "User data not found");
      return;
    }
    const userData = userSnap.data() || {};
    const languageId = userData.language_id as string | undefined;

    const normalize = (value: string | null) => {
      if (!value || !value.trim()) return null;
      const match = LANGUAGE_OPTIONS.find(
        (lang) => lang.toLowerCase() === value.trim().toLowerCase()
      );
      return match || null;
    };

    const normalizedList = languageInputs
      .map((val) => normalize(val))
      .filter((val) => val !== null) as string[];

    const lang1 = normalizedList[0] || null;
    const lang2 = normalizedList[1] || null;
    const lang3 = normalizedList[2] || null;
    const lang4 = normalizedList[3] || null;
    const lang5 = normalizedList[4] || null;

    if (!languageId) {
      const languageDocRef = doc(collection(db, "language"));
      const newLanguageID = languageDocRef.id;

      const data = {
        language_id: newLanguageID,
        userId: user.uid,
        language_1: lang1,
        language_2: lang2,
        language_3: lang3,
        language_4: lang4,
        language_5: lang5,
      };
      await setDoc(languageDocRef, data);
      await updateDoc(userRef, {
        language_id: newLanguageID,
      });
    } else {
      const languageDocRef = doc(db, "language", languageId);

      await updateDoc(languageDocRef, {
        language_1: lang1,
        language_2: lang2,
        language_3: lang3,
        language_4: lang4,
        language_5: lang5,
      });
    }

    Alert.alert("Success", "Update Language Successfully!");
    router.push("/(job-seekerTabs)/profile");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#d9efffff" }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.container}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => router.push("/(job-seekerTabs)/profile")}
            >
              <Ionicons name="arrow-back" size={24} color="black" />
            </TouchableOpacity>

            <View style={styles.header}>
              <Text style={styles.headerTitle}>Languages</Text>
            </View>

            <View style={styles.box}>
              {languageInputs.map((value, index) => (
                <View key={index} style={{ marginTop: index === 0 ? 0 : 16 }}>
                  <View style={styles.languageRowHeader}>
                    <Text style={styles.label}>Language {index + 1}:</Text>
                    {languageInputs.length > 1 && (
                      <TouchableOpacity
                        onPress={() => handleRemoveLanguageField(index)}
                        style={styles.removeIconBtn}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={18}
                          color="#e74c3c"
                        />
                      </TouchableOpacity>
                    )}
                  </View>

                  <TextInput
                    placeholder={`Enter your language ${index + 1}`}
                    style={styles._textInput}
                    value={value}
                    onChangeText={(text) => handleChangeLanguage(index, text)}
                    onFocus={() => handleFocusLanguage(index)}
                  />

                  {suggestions[index] && suggestions[index].length > 0 && (
                    <View style={styles.suggestionBox}>
                      <FlatList
                        keyboardShouldPersistTaps="handled"
                        data={suggestions[index]}
                        keyExtractor={(item) => item}
                        renderItem={({ item }) => (
                          <TouchableOpacity
                            style={styles.suggestionItem}
                            onPress={() => handleSelectSuggestion(index, item)}
                          >
                            <Text>{item}</Text>
                          </TouchableOpacity>
                        )}
                      />
                    </View>
                  )}
                </View>
              ))}

              {languageInputs.length < 5 && (
                <TouchableOpacity
                  style={styles.addLanguageBtn}
                  onPress={handleAddLanguageField}
                >
                  <Ionicons
                    name="add-circle-outline"
                    size={20}
                    color="#1B457C"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.addLanguageText}>
                    Add another language
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.btnNext}
                onPress={handleUpdateLanguage}
              >
                <Text style={styles.btnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    flex: 1,
  },
  backBtn: {
    position: "absolute",
    top: 40,
    left: 20,
    padding: 8,
  },
  header: {
    marginTop: 50,
    marginBottom: 30,
  },
  headerTitle: {
    color: "#8BA0FF",
    fontSize: 27,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 6,
  },
  box: {
    width: "100%",
    padding: 20,
    borderRadius: 12,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 4,
    marginTop: -10,
  },
  languageRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  removeIconBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  label: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1B457C",
  },
  btnNext: {
    padding: 10,
    borderWidth: 2,
    borderColor: "#7b9ef6ff",
    borderRadius: 30,
    width: "75%",
    alignSelf: "center",
    marginTop: 25,
    backgroundColor: "#e7eeffff",
  },
  btnText: {
    textAlign: "center",
    fontSize: 18,
    fontWeight: "600",
    color: "#1B457C",
  },
  _textInput: {
    marginBottom: 8,
    marginTop: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#7b9ef6ff",
    fontSize: 16,
    padding: 10,
    backgroundColor: "#f9fbff",
  },
  suggestionBox: {
    maxHeight: 150,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    backgroundColor: "#fff",
    marginBottom: 8,
  },
  suggestionItem: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  addLanguageBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 8,
  },
  addLanguageText: {
    fontSize: 15,
    color: "#1B457C",
    fontWeight: "500",
  },
});
