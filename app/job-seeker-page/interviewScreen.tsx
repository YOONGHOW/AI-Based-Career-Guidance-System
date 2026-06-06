import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import * as Speech from "expo-speech";
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { auth, db } from "../../firebaseConfig";

type Stage = "intro" | "question" | "result";
type AvatarState =
  | "idle"
  | "listening"
  | "speaking"
  | "thinking"
  | "intro"
  | "finish"
  | "result_good"
  | "result_bad";

const BACKEND_BASE_URL =
  `http://${process.env.EXPO_PUBLIC_API_IP || "localhost"}:5000`; /* dynamic IP via .env */

const ROLES = [
  "Data Scientist",
  "Marketing Associate",
  "Software Engineer",
  "UX Designer",
  "HR Specialist",
  "Machine Learning Engineer",
];

const ROLE_TO_BACKEND: Record<string, string | null> = {
  "Data Scientist": "data_scientist",
  "Marketing Associate": "marketing_associate",
  "Software Engineer": "software_engineer",
  "HR Specialist": "hr_specialist",
  "UX Designer": "uiux_designer",
  "Machine Learning Engineer": "machine_learning",
};

const recordingOptions: Audio.RecordingOptions = {
  android: {
    extension: ".wav",
    outputFormat: Audio.AndroidOutputFormat.DEFAULT,
    audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 128000,
  },
  ios: {
    extension: ".wav",
    audioQuality: Audio.IOSAudioQuality.MAX,
    sampleRate: 16000,
    numberOfChannels: 1,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
    bitRate: 128000,
  },
  web: {
    mimeType: "audio/wav",
    bitsPerSecond: 128000,
  },
};

type QuestionFromBackend = {
  question_id: number;
  question: string;
  role?: string;
  category?: string | null;
  difficulty?: string | null;
};

type BackendScore = {
  similarity: number;
  verdict: string;
  finalScore?: number;
  similarityDetail?: {
    tfidf: number;
    semantic: number;
    mixed: number; // 0–100
  };

  keywords: {
    important_keywords: string[];
    covered_keywords: string[];
    missing_keywords: string[];
  };

  coverage: number;
  lengthScore: number;
  lengthNote?: string;

  skipped?: boolean;
  answer?: string | null;
  modelAnswer?: string | null;
};

export default function MockInterviewScreen() {
  const router = useRouter();
  const live2dRef = useRef<WebView | null>(null);

  const [stage, setStage] = useState<Stage>("intro");
  const [selectedRole, setSelectedRole] = useState<string>(ROLES[0]);
  const [backendRole, setBackendRole] = useState<string | null>(null);

  const [questions, setQuestions] = useState<QuestionFromBackend[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [currentAnswer, setCurrentAnswer] = useState("");
  const [questionScores, setQuestionScores] = useState<BackendScore[]>([]);
  const [avatarReady, setAvatarReady] = useState(false);
  const [pendingAvatarState, setPendingAvatarState] =
    useState<AvatarState | null>(null);

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

  const [scores, setScores] = useState<{
    overall: number;
    communication: number;
    relevance: number;
    detail: number;
    totalQuestions: number;
    attemptedQuestions: number;
    skippedQuestions: number;
  } | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [micDisabled, setMicDisabled] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // -------------------------------------------------
  // Avatar state: send message to WebView (Live2D)
  // -------------------------------------------------
  const setAvatarState = (state: AvatarState) => {
    setPendingAvatarState(state);

    if (!live2dRef.current) {
      console.log("Avatar WebView not mounted yet, queued:", state);
      return;
    }

    if (!avatarReady) {
      console.log("Avatar not ready yet, queued:", state);
      return;
    }

    const msg = JSON.stringify({
      type: "SET_STATE",
      state,
    });

    try {
      live2dRef.current.postMessage(msg);
      console.log("Avatar state sent:", state);
    } catch (e) {
      console.log("Failed to post avatar state:", e);
    }
  };

  // send initial idle once when screen mounts
  React.useEffect(() => {
    setAvatarState("idle");
  }, []);

  const currentQuestion =
    questions.length > 0 && currentIndex < questions.length
      ? questions[currentIndex]
      : null;

  // ----------------------------------------
  // Text-to-speech helper
  // ----------------------------------------
  const speak = async (
    text: string,
    options?: { during?: AvatarState; after?: AvatarState }
  ): Promise<void> => {
    const { during = "speaking", after = "idle" } = options || {};

    return new Promise(async (resolve) => {
      try {
        setMicEnabled(false);
        setAvatarState(during);

        Speech.stop();
        Speech.speak(text, {
          language: "en-SG",
          pitch: 1.0,
          rate: 0.7,
          onDone: () => {
            setMicEnabled(true);
            setAvatarState(after);
            resolve();
          },
          onStopped: () => {
            setMicEnabled(true);
            setAvatarState(after);
            resolve();
          },
          onError: () => {
            setMicEnabled(true);
            setAvatarState(after);
            resolve();
          },
        });
      } catch (e) {
        console.log("Speech error:", e);
        setMicEnabled(true);
        setAvatarState(after);
        resolve();
      }
    });
  };

  // ----------------------------------------
  // Fetch questions from backend
  // ----------------------------------------
  const fetchQuestionsForRole = async (
    displayRole: string,
    backendRoleKey: string
  ) => {
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/next_questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: backendRoleKey, count: 10 }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        console.error("next_questions error:", data);
        Alert.alert("Error", data.error || "Failed to get questions.");
        return;
      }

      const qs: QuestionFromBackend[] = data.questions || [];
      setQuestions(qs);
      setCurrentIndex(0);
      setQuestionScores([]);

      if (qs.length === 0) {
        await speak("No questions found for this role.", {
          during: "speaking",
          after: "idle",
        });
        return;
      }
      await speak(
        `Let's start. I will ask you ${qs.length} questions for the ${displayRole}.`,
        { during: "speaking", after: "idle" }
      );

      await speak(qs[0].question, { during: "speaking", after: "idle" });
      Vibration.vibrate(100);
    } catch (e) {
      console.error("fetchQuestionsForRole error:", e);
      Alert.alert("Error", "Cannot contact interview server.");
    }
  };

  // ----------------------------------------
  // Create session in Firestore
  // ----------------------------------------
  const createSessionInFirestore = async (mappedRole: string) => {
    const user = auth.currentUser;
    if (!user) return null;

    const sessionRef = doc(collection(db, "mock_sessions"));
    const newSessionId = sessionRef.id;

    await setDoc(
      sessionRef,
      {
        userId: user.uid,
        role: mappedRole,
        startedAt: serverTimestamp(),
      },
      { merge: true }
    );

    setSessionId(newSessionId);
    return newSessionId;
  };

  const saveAnswerToFirestore = async (
    q: QuestionFromBackend,
    score: BackendScore,
    answerText: string | null,
    questionNumber: number
  ) => {
    const user = auth.currentUser;
    if (!user || !sessionId) return;

    const sessionRef = doc(db, "mock_sessions", sessionId);
    const answersRef = collection(sessionRef, "answers");

    await addDoc(answersRef, {
      userId: user.uid,
      questionId: questionNumber,
      questionNumber: questionNumber,
      datasetQuestionId: q.question_id,
      questionText: q.question,
      userAnswer: answerText,
      skipped: !!score.skipped,
      similarity: score.similarity,
      coverage: score.coverage,
      lengthScore: score.lengthScore,
      verdict: score.verdict,
      keywords: score.keywords,
      modelAnswer: score.modelAnswer ?? null,
      createdAt: serverTimestamp(),
    });
  };

  // ----------------------------------------
  // Finalize scores & save to session doc
  // ----------------------------------------
  const finalizeScores = async (
    allScores: BackendScore[],
    source: "answer" | "skip"
  ) => {
    const totalQuestions = allScores.length;

    const attemptedScores = allScores.filter(
      (s) => s && !s.skipped
    ) as BackendScore[];
    const attemptedQuestions = attemptedScores.length;
    const skippedQuestions = totalQuestions - attemptedQuestions;

    if (attemptedQuestions === 0) {
      const payload = {
        overall: 0,
        communication: 0,
        relevance: 0,
        detail: 0,
        totalQuestions,
        attemptedQuestions,
        skippedQuestions,
      };
      setScores(payload);
      setStage("result");

      if (sessionId) {
        const sessionRef = doc(db, "mock_sessions", sessionId);
        await setDoc(
          sessionRef,
          {
            totalQuestions,
            attemptedQuestions,
            skippedQuestions,
            overallScore: 0,
            communicationScore: 0,
            relevanceScore: 0,
            detailScore: 0,
            endedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      // Avatar: result not good
      setAvatarState("result_bad");

      await speak(
        `You attempted ${attemptedQuestions} out of ${totalQuestions} questions. Since you skipped all of them, no score could be calculated.`
      );
      return;
    }

    const n = attemptedQuestions;

    const avgSimilarity =
      attemptedScores.reduce((sum, s) => sum + s.similarity, 0) / n;
    const avgCoverage =
      attemptedScores.reduce((sum, s) => sum + s.coverage, 0) / n;
    const avgLength =
      attemptedScores.reduce((sum, s) => sum + s.lengthScore, 0) / n;

    const overall100 = ((avgSimilarity + avgCoverage + avgLength) / 3) * 100;
    const communication100 = avgLength * 100;
    const relevance100 = avgSimilarity * 100;
    const detail100 = avgCoverage * 100;

    // Avatar: good / bad result based on threshold
    if (overall100 >= 70) {
      setAvatarState("result_good");
    } else {
      setAvatarState("result_bad");
    }

    const finalScores = {
      overall: overall100,
      communication: communication100,
      relevance: relevance100,
      detail: detail100,
      totalQuestions,
      attemptedQuestions,
      skippedQuestions,
    };

    setScores(finalScores);
    setStage("result");

    if (sessionId) {
      const sessionRef = doc(db, "mock_sessions", sessionId);
      await setDoc(
        sessionRef,
        {
          totalQuestions,
          attemptedQuestions,
          skippedQuestions,
          overallScore: overall100,
          communicationScore: communication100,
          relevanceScore: relevance100,
          detailScore: detail100,
          endedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    await speak(
      `Thank you. You have completed the interview. You attempted ${attemptedQuestions} out of ${totalQuestions} questions. Your overall score is ${overall100.toFixed(
        0
      )}.`,
      { during: "finish", after: "finish" }
    );
  };

  // ----------------------------------------
  // Start interview
  // ----------------------------------------
  const handleStart = async () => {
    if (!selectedRole) {
      Alert.alert("Role Required", "Please choose a role first.");
      return;
    }

    const mapped = ROLE_TO_BACKEND[selectedRole];
    if (!mapped) {
      Alert.alert(
        "Not available yet",
        `${selectedRole} mock interview is not ready yet. Please choose another role.`
      );
      return;
    }

    setBackendRole(mapped);
    setStage("question");
    setScores(null);
    setCurrentAnswer("");
    setVoiceError(null);

    await createSessionInFirestore(mapped);

    await speak(
      `Hi, my name is Rachel. I am your interviewer. We will go through 10 questions for the ${selectedRole}.`,
      { during: "intro", after: "idle" }
    );

    await fetchQuestionsForRole(selectedRole, mapped);
  };

  const handleReplayQuestion = async () => {
    if (!currentQuestion) return;
    await speak(currentQuestion.question, {
      during: "speaking",
      after: "idle",
    });
  };

  // ----------------------------------------
  // Recording logic
  // ----------------------------------------
  const startRecording = async () => {
    try {
      setVoiceError(null);
      setCurrentAnswer("");

      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Permission Denied",
          "Microphone permission is required for voice input."
        );
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        recordingOptions,
        () => {},
        1000
      );

      recordingRef.current = recording;
      setIsRecording(true);

      // Avatar listening state
      setAvatarState("listening");
    } catch (e) {
      console.error("startRecording error:", e);
      setVoiceError("Failed to start recording.");
      setIsRecording(false);
    }
  };

  // ----------------------------------------
  // Handle answer (after STT)
  // ----------------------------------------
  const handleAnswer = async (answer: string) => {
    if (!currentQuestion) {
      setVoiceError("No current question to answer.");
      return;
    }

    if (!backendRole) {
      setVoiceError("Backend role not set.");
      return;
    }

    if (!answer.trim()) {
      await speak("Sorry, could you please answer again for clarification? ");
      return;
    }

    const cleanedAnswer = answer.trim();
    setCurrentAnswer(cleanedAnswer);

    let scoreData: BackendScore | null = null;

    try {
      const res = await fetch(`${BACKEND_BASE_URL}/score_answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: backendRole,
          question_id: currentQuestion.question_id,
          user_answer: cleanedAnswer,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        console.error("score_answer error:", data);
        setVoiceError("Failed to score your answer.");
        return;
      }

      // --- keywords ---
      const important =
        data.keywords?.important_keywords ?? data.keywords?.important ?? [];
      const covered =
        data.keywords?.covered_keywords ?? data.keywords?.covered ?? [];
      const missing =
        data.keywords?.missing_keywords ?? data.keywords?.missing ?? [];

      // Backend gives 0–100 coverage_score
      const coverageScore100 = data.keywords?.coverage_score ?? 0;
      const coverage = coverageScore100 / 100; // normalize to 0–1

      // --- similarity ---
      // Backend smart output: similarity.mixed_similarity_score is 0–100
      const mixedSim100 = data.similarity?.mixed_similarity_score ?? 0;
      const simNorm = mixedSim100 / 100; // 0–1 for your existing math

      const tfidfSim = data.similarity?.tfidf_similarity ?? 0;
      const semanticSim = data.similarity?.semantic_similarity ?? 0;

      // --- length ---
      const lengthScore100 = data.length?.length_score ?? 0;
      const lengthScore = lengthScore100 / 100;
      const lengthNote = data.length?.note ?? "";

      const referenceAnswer =
        data.model_answer || data.answer || data.Answer || null;

      scoreData = {
        similarity: simNorm,
        verdict: data.grade ?? "", // "Excellent" / "Good" / etc.
        finalScore: data.final_score ?? 0,

        similarityDetail: {
          tfidf: tfidfSim,
          semantic: semanticSim,
          mixed: mixedSim100,
        },

        keywords: {
          important_keywords: important,
          covered_keywords: covered,
          missing_keywords: missing,
        },

        coverage,
        lengthScore,
        lengthNote,

        skipped: false,
        answer: cleanedAnswer,
        modelAnswer: referenceAnswer,
      };
    } catch (e) {
      console.error("handleAnswer / score_answer error:", e);
      setVoiceError("Failed to score your answer.");
      return;
    }

    if (scoreData) {
      await saveAnswerToFirestore(
        currentQuestion,
        scoreData,
        cleanedAnswer,
        currentIndex + 1
      );
    }

    setQuestionScores((prev) => {
      const copy = [...prev];
      copy[currentIndex] = scoreData!;
      return copy;
    });

    const totalQuestions = questions.length;
    const isLast = currentIndex === totalQuestions - 1;

    if (!isLast) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setCurrentAnswer("");
      await speak("Okay, thank you. Let's move to the next question.", {
        during: "speaking",
        after: "idle",
      });
      await speak(questions[nextIndex].question);
    } else {
      const allScores = [...questionScores];
      allScores[currentIndex] = scoreData!;
      await finalizeScores(allScores, "answer");
    }
  };

  // ----------------------------------------
  // Handle skip
  // ----------------------------------------
  const handleSkipQuestion = async () => {
    if (!currentQuestion) return;

    if (!backendRole) {
      setVoiceError("Backend role not set.");
      return;
    }

    Speech.stop();

    let referenceAnswer: string | null = null;

    try {
      const res = await fetch(`${BACKEND_BASE_URL}/score_answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: backendRole,
          question_id: currentQuestion.question_id,
          user_answer: "skipped",
        }),
      });

      const data = await res.json();
      if (res.ok && !data.error) {
        referenceAnswer =
          data.model_answer || data.answer || data.Answer || null;
      } else {
        console.error("score_answer on skip error:", data);
      }
    } catch (e) {
      console.error("handleSkipQuestion / score_answer error:", e);
    }

    const skipScore: BackendScore = {
      similarity: 0,
      verdict: "Skipped by user",
      keywords: {
        important_keywords: [],
        covered_keywords: [],
        missing_keywords: [],
      },
      coverage: 0,
      lengthScore: 0,
      skipped: true,
      answer: null,
      modelAnswer: referenceAnswer,
    };

    await saveAnswerToFirestore(
      currentQuestion,
      skipScore,
      null,
      currentIndex + 1
    );

    setQuestionScores((prev) => {
      const copy = [...prev];
      copy[currentIndex] = skipScore;
      return copy;
    });

    const totalQuestions = questions.length;
    const isLast = currentIndex === totalQuestions - 1;

    if (!isLast) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setCurrentAnswer("");
      await speak("Okay. Let's move to the next question.");
      await speak(questions[nextIndex].question);
    } else {
      const allScores = [...questionScores];
      allScores[currentIndex] = skipScore;
      await finalizeScores(allScores, "skip");
    }
  };

  // ----------------------------------------
  // Stop recording & send to STT
  // ----------------------------------------
  const stopRecordingAndTranscribe = async () => {
    try {
      const recording = recordingRef.current;
      if (!recording) return;

      setIsRecording(false);
      setIsTranscribing(true);

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;

      if (!uri) {
        setVoiceError("No audio URI found.");
        setIsTranscribing(false);
        return;
      }

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Avatar thinking while STT + scoring
      setAvatarState("thinking");

      const res = await fetch(`${BACKEND_BASE_URL}/speech_to_text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioContent: base64,
          config: { languageCode: "en-US" },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error("STT backend error:", data);
        setVoiceError("Speech-to-text failed.");
      } else {
        const transcript =
          data.transcript ||
          (data.raw &&
            data.raw.results &&
            data.raw.results[0] &&
            data.raw.results[0].alternatives &&
            data.raw.results[0].alternatives[0].transcript) ||
          "";
        const cleaned = transcript.trim();

        if (!cleaned) {
          await speak(
            "Sorry, could you please answer again for clarification?"
          );
        } else {
          await handleAnswer(cleaned);
        }
      }
    } catch (e) {
      console.error("stopRecordingAndTranscribe error:", e);
      setVoiceError("Failed to transcribe audio.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleMicPress = () => {
    if (micDisabled) return;
    setMicDisabled(true);
    setTimeout(() => {
      setMicDisabled(false);
    }, 1000);

    if (isRecording) {
      stopRecordingAndTranscribe();
    } else {
      startRecording();
    }
  };

  const handleGoBack = () => {
    Speech.stop();
    setIsRecording(false);
    recordingRef.current = null;
    router.push("/(job-seekerTabs)/learn");
  };

  // ----------------------------------------
  // UI
  // ----------------------------------------
  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={handleGoBack}>
        <Ionicons name="arrow-back" size={30} color="black" />
      </TouchableOpacity>

      <View
        style={{
          width: 750,
          height: 750,
          position: "absolute",
          top: "5%",
        }}
      >
        <WebView
          ref={live2dRef}
          originWhitelist={["*"]}
          source={{
            uri: `http://${process.env.EXPO_PUBLIC_API_IP || "localhost"}:5500/avatar.html`, // dynamic IP via .env
          }}
          style={{ flex: 1, backgroundColor: "transparent" }}
          javaScriptEnabled
          domStorageEnabled
          onMessage={(event) => {
            try {
              const msg = JSON.parse(event.nativeEvent.data);

              if (msg.type === "avatar_ready") {
                console.log("AVATAR WEBVIEW: ready");
                setAvatarReady(true);

                if (pendingAvatarState && live2dRef.current) {
                  const flush = JSON.stringify({
                    type: "SET_STATE",
                    state: pendingAvatarState,
                  });
                  live2dRef.current.postMessage(flush);
                  console.log(
                    "Avatar state sent (flush queue):",
                    pendingAvatarState
                  );
                }
              } else if (msg.type === "log" || msg.type === "error") {
                console.log("AVATAR WEBVIEW:", msg.data);
              }
            } catch (e) {
              console.log("AVATAR RAW:", event.nativeEvent.data);
            }
          }}
        />
      </View>

      {stage === "intro" && (
        <View style={styles.intro_card}>
          <Text style={styles.title}>Mrs Rachel</Text>
          <Text style={styles.subtitle}>
            Select a role, and the virtual HR avatar will conduct a set of 10
            interview questions for that position.
          </Text>
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={selectedRole}
              onValueChange={(itemValue) => setSelectedRole(itemValue)}
              style={styles.picker}
            >
              {ROLES.map((role) => (
                <Picker.Item
                  key={role}
                  label={role}
                  value={role}
                  style={{ fontSize: 15 }}
                />
              ))}
            </Picker>
          </View>

          <TouchableOpacity style={styles.button} onPress={handleStart}>
            <Text style={styles.buttonText}>Start Interview</Text>
          </TouchableOpacity>
        </View>
      )}

      {stage === "question" && (
        <View>
          <Text style={styles.question_subtitle}>{selectedRole}</Text>
          <Text style={styles.question_subtitle}>
            Question {currentIndex + 1} of {questions.length || 10}
          </Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={[styles.smallButton, { marginTop: 8 }]}
              onPress={() => {
                handleReplayQuestion();
                Vibration.vibrate(100);
              }}
            >
              <Text style={styles.smallButtonText}>Listen Again</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.micButton,
                isRecording && styles.micButtonRecording,
                !micEnabled && { opacity: 0.4 },
              ]}
              onPress={handleMicPress}
              disabled={!micEnabled || isTranscribing}
            >
              <Ionicons
                name={isRecording ? "mic-off" : "mic"}
                size={32}
                color="white"
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.smallButton, { marginTop: 8 }]}
              onPress={() => {
                handleSkipQuestion();
                Vibration.vibrate(100);
              }}
              disabled={isTranscribing}
            >
              <Text style={styles.smallButtonText}>Skip this Question</Text>
            </TouchableOpacity>
            {voiceError && <Text style={styles.errorText}>{voiceError}</Text>}
          </View>
        </View>
      )}

      {stage === "result" && scores && (
        <View style={styles.intro_card}>
          <Text style={styles.title}>Your Interview Result</Text>
          <Text style={styles.overallScore}>
            Overall: {scores.overall.toFixed(0)} / 100
          </Text>

          <Text style={styles.scoreText}>
            Communication: {scores.communication.toFixed(0)} / 100
          </Text>
          <Text style={styles.scoreText}>
            Relevance: {scores.relevance.toFixed(0)} / 100
          </Text>
          <Text style={styles.scoreText}>
            Detail level: {scores.detail.toFixed(0)} / 100
          </Text>

          <Text style={styles.scoreText}>
            Attempted questions: {scores.attemptedQuestions} /{" "}
            {scores.totalQuestions}
          </Text>

          {sessionId && (
            <TouchableOpacity
              style={[styles.button, { marginTop: 12 }]}
              onPress={() => {
                // Avatar finish motion

                setStage("intro");
                setScores(null);
                setQuestions([]);
                setQuestionScores([]);
                setCurrentIndex(0);
                setCurrentAnswer("");
                setBackendRole(null);

                const finishedSessionId = sessionId;
                setSessionId(null);

                router.push({
                  pathname: "/job-seeker-page/interviewResultDetail",
                  params: { sessionId: finishedSessionId },
                });
              }}
            >
              <Text style={styles.buttonText}>Finish</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f4f6fb",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  backBtn: {
    position: "absolute",
    top: 40,
    left: 20,
    padding: 8,
    zIndex: 10,
  },
  card: {
    width: "100%",
    padding: 10,
    marginTop: "130%",
    backgroundColor: "transparent",
    borderRadius: 16,
  },

  intro_card: {
    width: "100%",
    padding: 10,
    marginTop: "130%",
    backgroundColor: "#fff",
    borderRadius: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    color: "#555",
    marginVertical: 4,
  },

  question_subtitle: {
    fontSize: 14,
    textAlign: "center",
    color: "#555",
    marginVertical: 4,
    fontWeight: "800",
  },
  button: {
    backgroundColor: "#4C6FFF",
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: "center",
    marginTop: 12,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  smallButton: {
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: "#eef1ff",
  },
  smallButtonText: {
    fontSize: 12,
    color: "#4C6FFF",
  },
  overallScore: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginVertical: 4,
  },
  scoreText: {
    fontSize: 15,
    marginTop: 4,
    textAlign: "center",
  },
  micButton: {
    backgroundColor: "#4C6FFF",
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginVertical: 10,
    elevation: 3,
  },
  micButtonRecording: {
    backgroundColor: "#FF4C4C",
  },
  errorText: {
    fontSize: 12,
    color: "red",
    textAlign: "center",
    marginBottom: 8,
  },
  pickerWrapper: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ccc",
    overflow: "hidden",
    marginTop: 6,
  },
  picker: {
    width: "100%",
  },
});
