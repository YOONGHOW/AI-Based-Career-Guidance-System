import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import {
  BackHandler,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function AccountType() {
  const router = useRouter();
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
    <SafeAreaView style={{ flex: 1, backgroundColor: "#d9efffff" }}>
      <View style={styles.container}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="black" />
        </TouchableOpacity>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Account Type</Text>
        </View>

        {/* Content Box */}
        <View style={styles.box}>
          <Text style={styles.boxTitle}>- Choose your account type -</Text>
          <Image
            source={require("../../assets/images/employer.png")}
            style={styles.headerImg}
            alt="logo"
          />
          <TouchableOpacity
            style={styles.btnNext}
            onPress={() => router.push("/auth-page/empRegister")}
          >
            <Text style={styles.btnText}>Employer</Text>
          </TouchableOpacity>
          <Image
            source={require("../../assets/images/job-seeker.png")}
            style={styles.headerImg}
            alt="logo"
          />
          <TouchableOpacity
            style={styles.btnNext}
            onPress={() => router.push("/auth-page/register")}
          >
            <Text style={styles.btnText}>Job Seeker</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    flex: 1,
  },
  header: {
    marginVertical: 30,
    marginTop: 70,
  },
  headerTitle: {
    color: "#8BA0FF",
    fontSize: 25,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 6,
  },

  headerImg: {
    height: "32%",
    width: "32%",
    alignSelf: "center",
    resizeMode: "contain",
  },

  boxTitle: {
    color: "#7cb7faff",
    fontSize: 17,
    fontWeight: "500",
    textAlign: "center",
    marginBottom: 6,
  },

  box: {
    width: "100%",
    height: "70%",
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 4,
    marginTop: -10,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1B457C",
  },
  backBtn: {
    position: "absolute",
    top: 40,
    left: 20,
    padding: 8,
  },
  btnNext: {
    padding: 10,
    borderWidth: 2,
    borderColor: "#7b9ef6ff",
    borderRadius: 30,
    width: "75%",
    alignSelf: "center",
    backgroundColor: "#e7eeffff",
    marginBottom: "5%",
  },
  btnText: {
    textAlign: "center",
    fontSize: 18,
    fontWeight: "600",
    color: "#1B457C",
  },
});
