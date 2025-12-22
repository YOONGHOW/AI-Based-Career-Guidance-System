// firebaseConfig.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
import { Auth, getAuth, initializeAuth } from "firebase/auth";
// @ts-ignore
import { getReactNativePersistence } from "firebase/auth";
import { Firestore, getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBXE2v9URY-tzbgSh7CPmfnbFJ_f3srnCM",
  authDomain: "careerguildancesystem.firebaseapp.com",
  projectId: "careerguildancesystem",
  storageBucket: "careerguildancesystem.appspot.com",
  messagingSenderId: "617860895059",
  appId: "1:617860895059:web:ec250a75eb51a2280151a6",
  measurementId: "G-M59BE059RE",
};

const app = initializeApp(firebaseConfig);
let auth: Auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  auth = getAuth(app);
}

// Initialize Firestore
const db: Firestore = getFirestore(app);
export const storage = getStorage(
  app,
  "gs://careerguildancesystem.firebasestorage.app"
);
export { app, auth, db };
