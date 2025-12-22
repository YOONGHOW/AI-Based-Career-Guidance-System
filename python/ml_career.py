import re
import numpy as np
import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import MultiLabelBinarizer, LabelEncoder
from sklearn.metrics import classification_report
from sklearn.neural_network import MLPClassifier
import joblib

# 1. CONFIG
CSV_PATH = "training_job_dataset.csv"   
MODEL_PATH = "job_category_mlp_sklearn.pkl"
ENCODER_PATH = "label_encoder.npy"                  
SKILL_VOCAB_PATH = "skill_vocab.npy"               
FIELD_ENCODER_PATH = "field_of_study_classes.npy"   
TOP_N_SKILLS = 300  


# 2. LOAD DATA
print("Loading job dataset...")

df = pd.read_csv(CSV_PATH, encoding="utf-8", on_bad_lines="skip")

required_cols = {"job_category", "skills", "field_of_study"}
missing = required_cols - set(df.columns)
if missing:
    raise ValueError(f"Missing columns in {CSV_PATH}: {missing}")

# drop rows with missing basics
df = df.dropna(subset=["job_category", "skills", "field_of_study"]).reset_index(drop=True)

print(f"Loaded {len(df)} rows from {CSV_PATH}")


# 3. PARSE skills INTO LISTS
def parse_skill_list(skill_str):
    """
    Convert "python | sql | excel" (or comma-separated) into
    a clean list of lowercase skills.
    """
    if not isinstance(skill_str, str):
        return []
    parts = re.split(r"[|,]", skill_str)
    clean = []
    for s in parts:
        s = s.strip().lower()
        if s:
            clean.append(s)
    return clean


df["skills_list"] = df["skills"].apply(parse_skill_list)

df = df[df["skills_list"].map(len) > 0].reset_index(drop=True)
print(f"Remaining jobs with valid skills: {len(df)}")


# 4. BUILD SKILL VOCABULARY
from collections import Counter

skill_counter = Counter()
for skills in df["skills_list"]:
    skill_counter.update(skills)

most_common_skills = [s for s, _ in skill_counter.most_common(TOP_N_SKILLS)]
print(f"Using top {TOP_N_SKILLS} skills as features.")
print("Sample of skills:", most_common_skills[:20])

mlb = MultiLabelBinarizer(classes=most_common_skills)
X_skills = mlb.fit_transform(df["skills_list"])
print("Skill matrix shape:", X_skills.shape)


# 5. ENCODE LABELS (JOB CATEGORY)
label_encoder = LabelEncoder()
y = label_encoder.fit_transform(df["job_category"])

num_classes = len(label_encoder.classes_)
print("Job categories:", list(label_encoder.classes_))
print("Number of classes:", num_classes)


# 6. ENCODE FIELD OF STUDY (FEATURE)
# normalize field_of_study text a bit
df["field_of_study_clean"] = df["field_of_study"].astype(str).str.strip()

field_encoder = LabelEncoder()
field_labels = field_encoder.fit_transform(df["field_of_study_clean"])

num_fields = len(field_encoder.classes_)
print("Field of study classes:", list(field_encoder.classes_))
print("Number of fields:", num_fields)

# one-hot encode field_of_study
X_field = np.eye(num_fields)[field_labels]

print("Field-of-study matrix shape:", X_field.shape)


# 7. COMBINE FEATURES: [skills | field_of_study]
X = np.hstack([X_skills, X_field])
print("Final feature matrix shape:", X.shape)


# 8. TRAIN / TEST SPLIT
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

print("Train shape:", X_train.shape, "Test shape:", X_test.shape)


# 9. BUILD & TRAIN MLP
clf = MLPClassifier(
    hidden_layer_sizes=(256, 128),
    activation="relu",
    solver="adam",
    max_iter=50,           
    random_state=42,
    verbose=True,
)

print("\nTraining MLPClassifier...")
clf.fit(X_train, y_train)

# 10. EVALUATE
print("\nEvaluating on test set...")
y_pred = clf.predict(X_test)
print("\nClassification report:")
print(classification_report(
    y_test,
    y_pred,
    target_names=label_encoder.classes_,
))


print(f"\nSaving MLP model to {MODEL_PATH} ...")
joblib.dump(clf, MODEL_PATH)

# job_category label classes
np.save(ENCODER_PATH, label_encoder.classes_)

# skill vocab (store lowercase)
np.save(SKILL_VOCAB_PATH, np.array(most_common_skills))

# field_of_study label classes
np.save(FIELD_ENCODER_PATH, field_encoder.classes_)

print("Saved label encoder classes to", ENCODER_PATH)
print("Saved skill vocab to", SKILL_VOCAB_PATH)
print("Saved field_of_study classes to", FIELD_ENCODER_PATH)

print("\nDone! You can now load job_category_mlp_sklearn.pkl in app.py.")
