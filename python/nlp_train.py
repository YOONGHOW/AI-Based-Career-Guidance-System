import os
import json
import re
import random
from typing import Dict, List, Any

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sentence_transformers import SentenceTransformer

# ==========================================
# Base path = the folder where THIS file is
# ==========================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

ROLE_FILES = {
    "machine_learning": ("json", "C:/Users/USER/SpaceCareer/python/nlp_train/ML_QA.json"),
    "data_scientist": ("csv", "C:/Users/USER/SpaceCareer/python/nlp_train/DS_QA.csv"),
    "software_engineer": ("csv", "C:/Users/USER/SpaceCareer/python/nlp_train/SE_QA.csv"),
    "uiux_designer": ("csv", "C:/Users/USER/SpaceCareer/python/nlp_train/UIUX_QA.csv"),
    "marketing_associate": ("csv", "C:/Users/USER/SpaceCareer/python/nlp_train/Marketing_QA.csv"),
    "hr_specialist": ("csv", "C:/Users/USER/SpaceCareer/python/nlp_train/HR_QA.csv"),
}

# =====================================================
# Text cleaning: remove emoji / weird non-ASCII chars
# =====================================================

def remove_non_ascii(text: str) -> str:
    return text.encode("ascii", "ignore").decode()

def clean_text(text: str) -> str:
    if text is None:
        return ""
    text = str(text)
    text = remove_non_ascii(text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _clean_column_names(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [c.strip().lower() for c in df.columns]

    rename_map = {}
    for c in df.columns:
        if "question" in c and "question" not in rename_map:
            rename_map[c] = "question"
        if "answer" in c and "answer" not in rename_map:
            rename_map[c] = "answer"

    df = df.rename(columns=rename_map)

    if "question" not in df.columns or "answer" not in df.columns:
        raise ValueError(
            f"CSV must contain 'question' and 'answer' columns. Got: {df.columns.tolist()}"
        )

    return df[["question", "answer"]]


def load_role_dataset(role: str) -> List[Dict[str, Any]]:
    role_key = role.lower()
    if role_key not in ROLE_FILES:
        raise ValueError(f"Unknown role '{role}'. Available: {list(ROLE_FILES.keys())}")

    file_type, path = ROLE_FILES[role_key]

    if not os.path.exists(path):
        raise FileNotFoundError(f"File not found for role '{role}': {path}")

    qa_list: List[Dict[str, Any]] = []

    if file_type == "json":
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        for idx, item in enumerate(data):
            raw_q = item.get("question", "")
            raw_a = item.get("answer", "")

            q = clean_text(raw_q)
            a = clean_text(raw_a)

            if q and a:
                qa_list.append({"id": idx, "question": q, "answer": a})

    elif file_type == "csv":
        # Try UTF-8 first
        try:
            df = pd.read_csv(path, encoding="utf-8")
        except UnicodeDecodeError:
            df = pd.read_csv(path, encoding="latin1")

        df = _clean_column_names(df)

        for idx, row in df.iterrows():
            raw_q = row["question"]
            raw_a = row["answer"]

            q = clean_text(raw_q)
            a = clean_text(raw_a)

            if q and a:
                qa_list.append({"id": idx, "question": q, "answer": a})

    if not qa_list:
        raise ValueError(f"No valid Q&A rows loaded for role '{role}'")

    return qa_list


def get_available_roles() -> List[str]:
    return list(ROLE_FILES.keys())


def pick_random_question(role: str) -> Dict[str, Any]:
    qa_list = load_role_dataset(role)
    item = random.choice(qa_list)
    return {
        "role": role,
        "id": item["id"],
        "question": item["question"],
        "sample_answer_preview": (
            item["answer"][:80] + "..." if len(item["answer"]) > 80 else item["answer"]
        ),
    }


def get_question_by_id(role: str, qid: int) -> Dict[str, Any]:
    qa_list = load_role_dataset(role)
    for item in qa_list:
        if item["id"] == qid:
            return item
    raise ValueError(f"Question id {qid} not found for role {role}")


# ==========================
# Tokenization & stop-words
# ==========================

STOP_WORDS = {
    "the", "is", "are", "a", "an", "of", "and", "or", "to", "in", "for", "on",
    "with", "that", "this", "it", "as", "at", "by", "from", "be", "can", "you",
    "we", "they", "he", "she", "i", "his", "her", "their", "our", "your", "?"
}


def tokenize(text: str) -> List[str]:
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return [t for t in text.split() if t and t not in STOP_WORDS]


def extract_keywords(text: str, max_keywords: int = 10) -> List[str]:
    tokens = tokenize(text)
    freq: Dict[str, int] = {}
    for t in tokens:
        freq[t] = freq.get(t, 0) + 1
    sorted_tokens = sorted(freq.items(), key=lambda x: x[1], reverse=True)
    return [t for t, _ in sorted_tokens[:max_keywords]]


# ======================
# TF-IDF similarity
# ======================

def compute_similarity(sample_answer: str, user_answer: str) -> float:

    if not sample_answer.strip() or not user_answer.strip():
        return 0.0
    vectorizer = TfidfVectorizer()
    tfidf = vectorizer.fit_transform([sample_answer, user_answer])
    score = cosine_similarity(tfidf[0:1], tfidf[1:2])[0][0]
    return float(score)

def compare_keywords(sample_answer: str, user_answer: str, max_keywords: int = 10) -> Dict[str, Any]:
    sample_keywords = extract_keywords(sample_answer, max_keywords=max_keywords)
    user_tokens = set(tokenize(user_answer))

    missing = [kw for kw in sample_keywords if kw not in user_tokens]
    covered = [kw for kw in sample_keywords if kw in user_tokens]

    return {
        "important_keywords": sample_keywords,
        "covered_keywords": covered,
        "missing_keywords": missing,
    }


def evaluate_answer_for_question(role: str, qid: int, user_answer: str) -> Dict[str, Any]:
    """
    Original simple evaluator (TF-IDF similarity + keywords).
    Kept for backward compatibility.
    """
    qa_item = get_question_by_id(role, qid)
    sample_answer = qa_item["answer"]

    sim = compute_similarity(sample_answer, user_answer)
    kw_info = compare_keywords(sample_answer, user_answer)

    return {
        "role": role,
        "question_id": qid,
        "question": qa_item["question"],
        "similarity": round(sim, 3),
        "keywords": kw_info,
        "sample_answer_preview": (
            sample_answer[:200] + "..." if len(sample_answer) > 200 else sample_answer
        ),
    }

# Load semantic model once (fast for repeated calls)
SEM_MODEL = SentenceTransformer("all-MiniLM-L6-v2")


def compute_semantic_similarity(sample_answer: str, user_answer: str) -> float:

    sample_answer = clean_text(sample_answer)
    user_answer = clean_text(user_answer)

    if not sample_answer.strip() or not user_answer.strip():
        return 0.0

    embeddings = SEM_MODEL.encode([sample_answer, user_answer])
    sim = cosine_similarity([embeddings[0]], [embeddings[1]])[0][0]
    # Clip to [0, 1]
    sim = max(0.0, min(1.0, float(sim)))
    return sim


def keyword_coverage_score(sample_answer: str, user_answer: str, max_keywords: int = 10) -> Dict[str, Any]:

    kw_info = compare_keywords(sample_answer, user_answer, max_keywords=max_keywords)
    total = len(kw_info["important_keywords"]) or 1
    covered = len(kw_info["covered_keywords"])
    coverage_ratio = covered / total  # 0.0–1.0

    coverage_score = round(coverage_ratio * 100.0, 1)

    return {
        "coverage_score": coverage_score,
        "coverage_ratio": round(coverage_ratio, 3),
        "important_keywords": kw_info["important_keywords"],
        "covered_keywords": kw_info["covered_keywords"],
        "missing_keywords": kw_info["missing_keywords"],
    }


def length_quality_score(
    user_answer: str,
    min_words: int = 40,
    max_words: int = 200
) -> Dict[str, Any]:

    tokens = tokenize(user_answer)
    n_words = len(tokens)

    if n_words == 0:
        return {"length_score": 0.0, "word_count": 0, "note": "Empty answer"}

    # Too short → strong penalty
    if n_words < min_words:
        ratio = n_words / float(min_words) 
        score = max(0.0, ratio * 60.0)     
        note = "Too short"

    # Too long → gentle penalty
    elif n_words > max_words:
        ratio = max_words / float(n_words)
        score = max(40.0, ratio * 100.0)    
        note = "Too long"

    # In ideal range
    else:
        score = 100.0
        note = "Within ideal range"

    return {"length_score": round(score, 1), "word_count": n_words, "note": note}


def evaluate_answer_for_question_smart(role: str, qid: int, user_answer: str) -> Dict[str, Any]:

    qa_item = get_question_by_id(role, qid)
    sample_answer = qa_item["answer"]

    tfidf_sim = compute_similarity(sample_answer, user_answer)
    sem_sim = compute_semantic_similarity(sample_answer, user_answer)

    mixed_sim = 0.3 * tfidf_sim + 0.7 * sem_sim
    sim_score = round(mixed_sim * 100.0, 1)  # 0–100

    kw = keyword_coverage_score(sample_answer, user_answer, max_keywords=10)

    length_info = length_quality_score(user_answer)

    FINAL_SIM_WEIGHT = 0.55
    FINAL_KW_WEIGHT = 0.30
    FINAL_LEN_WEIGHT = 0.15

    final_score = (
        FINAL_SIM_WEIGHT * sim_score +
        FINAL_KW_WEIGHT * kw["coverage_score"] +
        FINAL_LEN_WEIGHT * length_info["length_score"]
    )

    final_score = round(final_score, 1)

    if final_score >= 85:
        grade = "Excellent"
    elif final_score >= 70:
        grade = "Good"
    elif final_score >= 50:
        grade = "Fair"
    else:
        grade = "Needs Improvement"

    return {
        "role": role,
        "question_id": qid,
        "question": qa_item["question"],

        "final_score": final_score,   
        "grade": grade,

        "similarity": {
            "tfidf_similarity": round(tfidf_sim, 3),
            "semantic_similarity": round(sem_sim, 3),
            "mixed_similarity_score": sim_score,
        },

        "keywords": kw,              
        "length": length_info,       

        "sample_answer_preview": (
            sample_answer[:200] + "..." if len(sample_answer) > 200 else sample_answer
        ),
    }

