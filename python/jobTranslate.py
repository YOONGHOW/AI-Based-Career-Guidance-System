from deep_translator import GoogleTranslator
from sentence_transformers import SentenceTransformer, util
from collections import Counter
import pandas as pd
import re
import torch
import os

# =====================================
# CONFIG
# =====================================

# Path to your enriched training dataset
# (change this if the CSV is elsewhere)
CSV_PATH = os.path.join(
    os.path.dirname(__file__),
    "training_job_dataset.csv"
)

# Same model you use in the main scraper
EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"

# If similarity is below this, we return "Other"
SIMILARITY_THRESHOLD = 0.35


def translate_to_english(text: str) -> str:
    """
    Translate any language to English using GoogleTranslator.
    If translation fails, return original text.
    """
    if not text:
        return text
    try:
        return GoogleTranslator(source="auto", target="en").translate(text)
    except Exception:
        return text


def parse_skill_list(skill_str: str) -> list[str]:
    """
    Convert 'python | sql | excel' (or comma-separated)
    into a clean list of lowercase skill tokens.
    """
    if not isinstance(skill_str, str):
        return []
    parts = re.split(r"[|,]", skill_str)
    out: list[str] = []
    for p in parts:
        s = p.strip().lower()
        if s:
            out.append(s)
    return out


# =====================================
# BUILD CATEGORY PROTOTYPES FROM DATASET
# =====================================

print(f"📁 Loading training dataset for category prototypes: {CSV_PATH}")

try:
    df = pd.read_csv(CSV_PATH)
except Exception as e:
    print(f"⚠️ Could not load {CSV_PATH}: {e}")
    df = pd.DataFrame(columns=["job_category", "skills"])

# Keep only rows that have both category and skills
if not df.empty:
    df = df.dropna(subset=["job_category", "skills"]).reset_index(drop=True)

# Normalize category names (but DO NOT lowercase here,
# we keep original labels but treat them case-insensitively in text)
if not df.empty:
    df["job_category"] = df["job_category"].astype(str).str.strip()
else:
    df["job_category"] = []

# Unique categories from your dataset
CATEGORIES: list[str] = sorted(df["job_category"].unique().tolist()) if not df.empty else []

if not CATEGORIES:
    print("⚠️ No job categories found in dataset. Classifier will always return 'Other'.")
else:
    print(f"✅ Loaded {len(CATEGORIES)} job categories from dataset.")

# For each category, collect its most common skills and build a prototype description sentence
category_texts: list[str] = []

for cat in CATEGORIES:
    subset = df[df["job_category"] == cat]
    all_skills: list[str] = []

    for raw in subset["skills"]:
        all_skills.extend(parse_skill_list(raw))

    # Get most common skills for this category
    if all_skills:
        skill_counts = Counter(all_skills)
        top_skills = [s for s, _ in skill_counts.most_common(30)]
        skills_part = ", ".join(top_skills)
        text = f"{cat}. Key skills: {skills_part}"
    else:
        text = cat

    category_texts.append(text)

# =====================================
# LOAD EMBEDDING MODEL AND ENCODE CATEGORIES
# =====================================

if CATEGORIES:
    print("⏳ Loading SentenceTransformer model for job category mapping...")
    category_model = SentenceTransformer(EMBEDDING_MODEL_NAME)

    print("⏳ Encoding job category prototypes...")
    category_embeddings = category_model.encode(
        category_texts,
        convert_to_tensor=True,
        normalize_embeddings=True,
    )
    print("✅ Category embeddings ready.")
else:
    category_model = None
    category_embeddings = None


# =====================================
# CLASSIFY FUNCTION
# =====================================

def classify_job_function(raw_text: str) -> str:
    """
    Classify job (title + function + description text)
    into one of the dataset job_category labels.

    Expected usage in scraper:
      combined_text = f"{job_name}. {job_function_translated or ''}. {job_description[:400]}"
      category = classify_job_function(combined_text)
    """
    # If dataset failed to load or model not ready
    if not CATEGORIES or category_model is None or category_embeddings is None:
        return "Other"

    if not raw_text or not raw_text.strip():
        return "Other"

    # Translate to English to normalize language
    translated = translate_to_english(raw_text)
    query = translated.strip()
    if not query:
        return "Other"

    # Encode query
    query_emb = category_model.encode(
        [query],
        convert_to_tensor=True,
        normalize_embeddings=True,
    )  # shape: (1, dim)

    # Compute similarity with all category prototypes
    scores = util.cos_sim(query_emb, category_embeddings)[0]  # shape: (num_categories,)
    best_idx = int(torch.argmax(scores))
    best_score = float(scores[best_idx])
    best_cat = CATEGORIES[best_idx]

    # Optional: debug print
    # print(f"Query: {query[:80]!r} -> {best_cat} (score={best_score:.3f})")

    # If similarity too low, treat as "Other"
    if best_score < SIMILARITY_THRESHOLD:
        return "Other"

    return best_cat
