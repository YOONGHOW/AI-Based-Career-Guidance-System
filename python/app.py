from flask import Flask, jsonify, request
import os
import base64, io
from pydub import AudioSegment
import requests
import firebase_admin
from firebase_admin import credentials, firestore
from flask_cors import CORS
from collections import Counter
import joblib
import pandas as pd
import random
import ast
import re
import numpy as np
import pickle
import ast
import tensorflow as tf
from sklearn.preprocessing import LabelEncoder
from typing import Optional, Tuple
import requests
from bs4 import BeautifulSoup 
import json
COURSERA_ENTERPRISE_BASE = "https://api.coursera.com/api/rest/v1"
PROGRAM_ID = os.getenv("COURSERA_PROGRAM_ID")

from nlp_train import (
    get_available_roles,
    load_role_dataset,
    pick_random_question,
    evaluate_answer_for_question,
    evaluate_answer_for_question_smart,
)
#----------- Audio Setup -----------------------
os.environ["PATH"] += os.pathsep + r"C:\ffmpeg_tools"
AudioSegment.converter = r"C:\ffmpeg_tools\ffmpeg.exe"
AudioSegment.ffprobe = r"C:\ffmpeg_tools\ffprobe.exe"

# --- Flask setup ---
app = Flask(__name__)
CORS(app)

# --- Firebase setup ---
cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

CATEGORY_TO_DOMAIN = {
    "software engineer": "Information Technology",
    "web developer": "Information Technology",
    "mobile app developer": "Information Technology",
    "devops engineer": "Information Technology",
    "cybersecurity analyst": "Information Technology",
    "ui/ux designer": "Computer Science",
    "graphic designer": "Arts and Humanities",

    "data analyst": "Data Science",
    "data scientist": "Data Science",

    "business analyst": "Business",
    "project manager": "Business",
    "hr specialist": "Business",
    "digital marketing specialist": "Business",
    "finance & accounting executive": "Business",
    "supply chain executive": "Business",
    "sales executive": "Business",
    "customer support executive": "Business",
    "hospitality & tourism executive": "Business",

    "mechanical engineer": "Engineering",
    "electrical engineer": "Engineering",
    "civil engineer": "Engineering",
    "chemical engineer": "Engineering",

    "nurse": "Health",
    "pharmacist": "Health",

    "teacher / lecturer": "Education",
}

# --- Cousera Scrape Setup ---

with open("unique_skills.json", "r", encoding="utf-8") as f:
    unique_skill = json.load(f)

unique_skill = sorted({s.lower().strip() for s in unique_skill if s and isinstance(s, str)})

print(f"Loaded {len(unique_skill)} skills into vocabulary")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

# ===================================================================
# Load ML model and mappings
# ===================================================================
# ===================================================================
# Load ML model and mappings (sklearn MLP)
# ===================================================================

# Load label encoder classes
# Load label encoder classes (job_category)
label_encoder_classes = np.load("label_encoder.npy", allow_pickle=True)
label_encoder = LabelEncoder()
label_encoder.classes_ = label_encoder_classes

# Load skill vocabulary (all lowercased from training script)
skill_vocab = list(np.load("skill_vocab.npy", allow_pickle=True))
skill_vocab = [str(s).lower() for s in skill_vocab]
skill_to_index = {s: i for i, s in enumerate(skill_vocab)}

try:
    field_classes = list(np.load("field_of_study_classes.npy", allow_pickle=True))
    field_classes = [str(f).strip().lower() for f in field_classes]
    field_to_index = {f: i for i, f in enumerate(field_classes)}
    num_fields = len(field_classes)
    print(f"Loaded {num_fields} field_of_study classes.")
except Exception as e:
    print("WARNING: Could not load field_of_study_classes.npy:", e)
    field_classes = []
    field_to_index = {}
    num_fields = 0


def skills_to_vector(skills_list):
    """
    One-hot vector for skills only (part 1 of feature vector).
    """
    vec = np.zeros(len(skill_vocab), dtype=float)
    for s in skills_list:
        if not isinstance(s, str):
            continue
        s_lower = s.lower().strip()
        if s_lower in skill_to_index:
            vec[skill_to_index[s_lower]] = 1.0
    return vec


def field_to_one_hot(field_of_study: str):
    """
    One-hot vector for field_of_study (part 2 of feature vector).
    If field_of_study not known or encoder not loaded -> zeros.
    """
    if num_fields == 0 or not isinstance(field_of_study, str):
        return np.zeros(num_fields, dtype=float)

    key = field_of_study.strip().lower()
    vec = np.zeros(num_fields, dtype=float)
    idx = field_to_index.get(key)
    if idx is not None:
        vec[idx] = 1.0
    return vec


def build_feature_vector(skills_list, field_of_study: str):
    """
    Combine skills + field_of_study into one feature vector,
    matching the training script: [skills | field].
    """
    norm_skills = normalize_skills(skills_list)
    v_skills = skills_to_vector(norm_skills)

    if num_fields > 0:
        v_field = field_to_one_hot(field_of_study)
        return np.concatenate([v_skills, v_field])
    else:
        # fallback: only skills
        return v_skills


def normalize_skills(skills):
    """
    Lowercase + strip + de-duplicate a list of skills.
    """
    norm = []
    for s in skills or []:
        if not isinstance(s, str):
            continue
        s2 = s.strip().lower()
        if not s2:
            continue
        norm.append(s2)
    # keep order but remove duplicates
    return list(dict.fromkeys(norm))


def map_category_to_domain(predicted_category: str) -> Optional[str]:
    """
    Convert MLP job category label into a Coursera domain string.

    Handles:
    - exact mapping via CATEGORY_TO_DOMAIN
    - fuzzy contains (e.g. 'business-development' -> 'Business')
    - fallback: title-case label
    """
    if not predicted_category:
        return None

    raw = str(predicted_category).strip()
    key = raw.lower()

    # 1) Exact mapping
    if key in CATEGORY_TO_DOMAIN:
        return CATEGORY_TO_DOMAIN[key]

    # 2) Fuzzy rules by keyword (good for labels like 'business-development', 'business-operations', etc.)
    if "business" in key:
        return "Business"
    if "information technology" in key or key == "it" or key.startswith("it-"):
        return "Information Technology"
    if "data" in key and ("science" in key or "analytics" in key):
        return "Data Science"
    if "design" in key or "ui" in key or "ux" in key:
        return "Computer Science"  # or 'Information Technology' or another domain you use
    if "human resources" in key or "hr" in key:
        return "Business"

    # 3) Fallback: make it look like a Coursera domain
    #   e.g. 'healthcare' -> 'Healthcare'
    s = raw.replace("_", " ").replace("-", " ")
    return s.title()



def level_rank(level_text: Optional[str]) -> int:
    """
    Map course_level text to a numeric rank for sorting.
    Lower number = easier course.
    """
    if not isinstance(level_text, str):
        return 3
    lt = level_text.lower()
    if "beginner" in lt:
        return 1
    if "mixed" in lt or "all" in lt:
        return 2
    if "intermediate" in lt:
        return 3
    if "advanced" in lt:
        return 4
    return 3

# Load the sklearn MLP model
try:
    job_category_model = joblib.load("job_category_mlp_sklearn.pkl")
    print("Sklearn MLP job category model loaded successfully.")
except Exception as e:
    print("WARNING: Could not load job_category_mlp_sklearn.pkl:", e)
    job_category_model = None

# ------------------- Load job posts & parse skills -------------------

# Load job posts from Firestore instead of CSV
job_docs = db.collection("job").stream()

jobs_df = []

for doc in job_docs:
    data = doc.to_dict()
    # ensure job_skill_set exists
    skills = data.get("job_skill_set", [])
    if isinstance(skills, list):
        skills = [x.lower() for x in skills]

    jobs_df.append({
        "job_id": data.get("job_id"),
        "job_title": data.get("job_name"),
        "category": data.get("job_category"),
        "skills_list": skills,
        "company_name": data.get("company_name"),
        "location": data.get("job_location"),
        "salary": data.get("job_salary"),
        "job_type": data.get("job_type"),
        "link": data.get("link"),
        "description": data.get("job_description"),
    })

import pandas as pd
jobs_df = pd.DataFrame(jobs_df)

if not jobs_df.empty:
    jobs_df["category"] = jobs_df["category"].astype(str).str.strip()
    jobs_df["category_norm"] = jobs_df["category"].str.lower()
else:
    jobs_df["category_norm"] = []
# ===================================================================
# API Endpoint
# ===================================================================
@app.route("/recommend", methods=["POST"])
def recommend():
    data = request.get_json() or {}

    user_skills = data.get("skills", [])
    field_of_study = data.get("field_of_study", "")

    if not user_skills:
        return jsonify({"error": "skills list required"}), 400

    # 1️⃣ Normalize skills once
    user_skills_norm = normalize_skills(user_skills)
    user_skill_set = {s.lower().strip() for s in user_skills_norm}

    # 2️⃣ Predict user category using sklearn MLP
    if job_category_model is not None:
        user_feature_vector = build_feature_vector(user_skills_norm, field_of_study)
        pred_probs = job_category_model.predict_proba(
            [user_feature_vector]  # sklearn expects 2D array
        )[0]
        predicted_idx = int(np.argmax(pred_probs))
        predicted_category = label_encoder.inverse_transform([predicted_idx])[0]
        print("Predicted category (MLP):", predicted_category)
    else:
        predicted_category = "Unknown"
        print("Job category model not available; skipping ML prediction.")

    # 3️⃣ Filter jobs by predicted category (focus)
    subset = jobs_df.copy()

    if (
        predicted_category
        and isinstance(predicted_category, str)
        and predicted_category.lower() != "unknown"
        and "category_norm" in subset.columns
    ):
        norm_cat = predicted_category.strip().lower()
        cat_subset = subset[subset["category_norm"] == norm_cat]

        if not cat_subset.empty:
            print(
                f"Using category-focused subset for '{predicted_category}':",
                len(cat_subset),
                "jobs",
            )
            subset = cat_subset
        else:
            print(
                f"No jobs found for category '{predicted_category}', falling back to all jobs."
            )
    else:
        print("No valid predicted category; using all jobs for skill matching.")

    # 4️⃣ Compute skill match %
    recommendations = []

    for _, row in subset.iterrows():
        job_skills = row.get("skills_list") or []
        job_skill_set = {
            s.lower().strip()
            for s in job_skills
            if isinstance(s, str) and s.strip()
        }

        if not job_skill_set:
            continue

        overlap = user_skill_set & job_skill_set
        overlap_count = len(overlap)

        if overlap_count == 0:
            continue

        skill_match_percent = (
            overlap_count / len(job_skill_set) * 100
            if len(job_skill_set) > 0
            else 0
        )

        recommendations.append(
            {
                "job_id": row.get("job_id"),
                "job_title": row.get("job_title"),
                "category": row.get("category"),
                "match_percent": round(skill_match_percent, 2),
                "matched_skills": sorted(list(overlap)),
            }
        )


    # 5️⃣ Sort by match % and return top 10
    recommendations.sort(key=lambda x: x["match_percent"], reverse=True)

    return jsonify(
        {
            "predicted_category": predicted_category,
            "recommendations": recommendations[:10],
            "status": "success",
        }
    )



# ---------------------------------------------
#Interview endpoints
# ---------------------------------------------
@app.route("/mock_interview/roles", methods=["GET"])
def list_mock_roles():
    roles = get_available_roles()
    return jsonify({"roles": roles})


# ---------------------------------------------
# Interview endpoints 
# ---------------------------------------------

@app.route("/next_questions", methods=["POST"])
def next_questions():

    data = request.get_json() or {}
    role = data.get("role")
    count = int(data.get("count", 5))

    if not role:
        return jsonify({"error": "role is required"}), 400

    try:
        qa_list = load_role_dataset(role)
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    if not qa_list:
        return jsonify({"error": f"No questions found for role: {role}"}), 404

    sample_n = min(count, len(qa_list))
    sampled = random.sample(qa_list, sample_n)

    questions = []
    for item in sampled:
        questions.append({
            "question_id": int(item["id"]),
            "question": item["question"],
            "role": role,                    
            "category": None,
            "difficulty": None,
        })

    return jsonify({
        "role": role,
        "count": sample_n,
        "questions": questions,
    })


@app.route("/score_answer", methods=["POST"])
def score_answer_api():
    """
    Body: {
      "role": "machine_learning",
      "question_id": 0,
      "user_answer": "..."
    }
    """
    data = request.get_json() or {}
    role = data.get("role")
    qid = data.get("question_id")
    user_answer = data.get("user_answer", "")

    if role is None:
        return jsonify({"error": "role is required"}), 400

    if qid is None:
        return jsonify({"error": "question_id is required"}), 400

    try:
        qid = int(qid)
    except ValueError:
        return jsonify({"error": "question_id must be integer"}), 400

    try:
        result = evaluate_answer_for_question_smart(role, qid, user_answer)

        qa_list = load_role_dataset(role)
        model_answer = None

        if isinstance(qa_list, list):
            for row in qa_list:
                if str(row.get("id")) == str(qid):
                    model_answer = row.get("answer")
                    break

        result["model_answer"] = model_answer

        print(f"[score_answer] role={role}, qid={qid}, smart_score={result.get('final_score')}")

        return jsonify(result)

    except Exception as e:
        print("Error in score_answer_api:", e)
        return jsonify({"error": str(e)}), 400



# ---------------------------------------------
# Course scraping helpers (Coursera)
# ---------------------------------------------
def fetch_coursera_meta(slug: str) -> Tuple[list[str], Optional[str]]:
    """
    Scrape 'Skills you'll gain' AND difficulty level from Coursera page.

    Returns:
        (skills, level)
        - skills: list[str]
        - level: e.g. 'Beginner', 'Intermediate', 'Advanced', 'Mixed', or None if not found
    """

    urls = [
        f"https://www.coursera.org/learn/{slug}",
        f"https://www.coursera.org/specializations/{slug}",
    ]

    collected: list[str] = []
    level: Optional[str] = None

    # Pattern to catch things like "Beginner level", "Intermediate level", etc.
    level_pattern = re.compile(
        r"\b(Beginner|Intermediate|Advanced|Mixed|All Levels)\s+level\b",
        re.IGNORECASE,
    )

    for url in urls:
        try:
            resp = requests.get(url, headers=HEADERS, timeout=12)
            if resp.status_code != 200:
                print(f"[HTML meta] {slug}: {url} -> HTTP {resp.status_code}")
                continue
        except Exception as e:
            print(f"[HTML meta] {slug}: request error for {url}: {e}")
            continue

        soup = BeautifulSoup(resp.text, "html.parser")

        # ----------- 1) Difficulty / level (from whole page text) -----------
        if level is None:  # only try to find once
            text = soup.get_text(separator=" ", strip=True)
            m = level_pattern.search(text)
            if m:
                # Normalize to nice casing: Beginner / Intermediate / Advanced / Mixed / All Levels
                level = m.group(1).title()
                print(f"[HTML level] {slug}: {level}")

        # ----------- 2) Skills list (similar logic as before) -----------
        skill_uls = soup.find_all(
            "ul",
            class_=lambda c: c and "css-1ltoca3" in c.split()
        )

        tmp: list[str] = []

        for ul in skill_uls:
            # Variant 1: <a href="/courses?query=...">Skill</a>
            for a in ul.find_all("a"):
                text = a.get_text(strip=True)
                if text:
                    tmp.append(text)

            # Variant 2: spans with aria-hidden="true"
            for span in ul.find_all("span", attrs={"aria-hidden": "true"}):
                text = span.get_text(strip=True)
                if text:
                    tmp.append(text)

        # Clean + filter
        cleaned: list[str] = []
        for t in tmp:
            t = re.sub(r"^Category:\s*", "", t).strip()
            if not t:
                continue
            if t in {"@", "•", "|", "ForIndividuals", "ForBusinesses",
                     "ForUniversities", "ForGovernments"}:
                continue
            if not re.search(r"[A-Za-z0-9]", t):
                continue
            if len(t) < 2 or len(t) > 80:
                continue
            cleaned.append(t)

        if cleaned:
            collected.extend(cleaned)
            # usually first URL is enough
            break

    # de-duplicate while preserving order
    seen = set()
    unique_skills: list[str] = []
    for s in collected:
        if s not in seen:
            seen.add(s)
            unique_skills.append(s)

    print(f"[HTML skills] {slug}: {len(unique_skills)} skills -> {unique_skills}")
    return unique_skills, level

def fetch_coursera_skills(slug: str) -> list[str]:
    """
    Backwards-compatible wrapper: keep old function name/signature
    but internally use fetch_coursera_meta.
    """
    skills, _ = fetch_coursera_meta(slug)
    return skills

# ---------------------------------------------
# Coursera API helpers for provider / domain / subdomain
# ---------------------------------------------
def build_partner_map(base_api: str, ids: set[str]):
    """
    Get richer provider/company details for Coursera partners:
    name, shortName, description, logo, links
    """
    if not ids:
        return {}
    ids_param = ",".join(ids)
    fields = "name,shortName,description,logo,links"
    url = f"{base_api}/partners.v1?ids={ids_param}&fields={fields}"
    print(f"Fetching partners.v1 for {len(ids)} ids")
    resp = requests.get(url)
    resp_json = resp.json()
    mapping = {}
    for el in resp_json.get("elements", []):
        _id = str(el.get("id"))
        if not _id:
            continue
        mapping[_id] = {
            "id": _id,
            "name": el.get("name"),
            "shortName": el.get("shortName"),
            "description": el.get("description"),
            "logo": el.get("logo"),   # sometimes "squareLogo" might be available
            "links": el.get("links"),
        }
    return mapping

def build_generic_map(base_api: str, endpoint: str, ids: set[str], name_field: str = "name"):
    """
    Simple helper to map domain/subdomain IDs -> name
    """
    if not ids:
        return {}
    ids_param = ",".join(ids)
    url = f"{base_api}/{endpoint}?ids={ids_param}&fields={name_field}"
    print(f"Fetching {endpoint} for {len(ids)} ids")
    resp = requests.get(url)
    resp_json = resp.json()
    mapping = {}
    for el in resp_json.get("elements", []):
        _id = str(el.get("id"))
        _name = el.get(name_field)
        if _id and _name:
            mapping[_id] = _name
    return mapping

def unique_list(seq):
    seen = set()
    out = []
    for x in seq:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out

# ---------------------------------------------
# Course route - scrape + save to Firestore
# ---------------------------------------------
@app.route("/scrape_courses")
def scrape_courses():
    limit = 250
    start = 0
    max_new = 250
    total_saved = 0
    total_skipped = 0
    total_received = 0

    base_api = "https://www.coursera.org/api"

    while True:
        if total_saved >= max_new:
            print("Reached max_new new courses, stopping pagination.")
            break

        api_url = (
            f"{base_api}/courses.v1"
            f"?limit={limit}&start={start}"
            f"&fields=description,photoUrl,slug,partnerIds,domainTypes"
        )

        print(f"Fetching courses: start={start}, limit={limit}")
        response = requests.get(api_url)
        data = response.json()

        elements = data.get("elements", [])
        if not elements:
            print("No more results. Stopping pagination.")
            break

        total_received += len(elements)

        # --------------------------------------------------------
        # 1. Collect all partner / domain / subdomain IDs in batch
        # --------------------------------------------------------
        partner_ids_set = set()
        domain_ids_set = set()
        subdomain_ids_set = set()

        for item in elements:
            for pid in item.get("partnerIds", []):
                if pid:
                    partner_ids_set.add(str(pid))

            for dt in item.get("domainTypes", []):
                d_id = dt.get("domainId")
                sd_id = dt.get("subdomainId")
                if d_id:
                    domain_ids_set.add(str(d_id))
                if sd_id:
                    subdomain_ids_set.add(str(sd_id))

        # --------------------------------------------------------
        # 2. Fetch partner / domain / subdomain metadata
        # --------------------------------------------------------
        partner_map = build_partner_map(base_api, partner_ids_set)
        domain_map = build_generic_map(base_api, "domains.v1", domain_ids_set, "name")
        subdomain_map = build_generic_map(base_api, "subdomains.v1", subdomain_ids_set, "name")

        # --------------------------------------------------------
        # 3. Save each course to Firestore (skip existing)
        # --------------------------------------------------------
        for item in elements:
            if total_saved >= max_new:
                break

            title = item.get("name")
            description = item.get("description", "No description available")
            image = item.get("photoUrl", "")
            slug = item.get("slug")

            if not slug or not title:
                continue

            doc_ref = db.collection("courses").document(slug)
            doc_snap = doc_ref.get()

            partner_ids = [str(pid) for pid in item.get("partnerIds", []) if pid]

            provider_details = []
            provider_names = []

            for pid in partner_ids:
                info = partner_map.get(pid)
                if not info:
                    continue
                provider_details.append(info)
                if info.get("name"):
                    provider_names.append(info["name"])

            domains = []
            subdomains = []
            for dt in item.get("domainTypes", []):
                d_id = dt.get("domainId")
                sd_id = dt.get("subdomainId")
                if d_id and domain_map.get(str(d_id)):
                    domains.append(domain_map[str(d_id)])
                if sd_id and subdomain_map.get(str(sd_id)):
                    subdomains.append(subdomain_map[str(sd_id)])

            provider_names = unique_list(provider_names)
            domains = unique_list(domains)
            subdomains = unique_list(subdomains)

            coursera_skills, course_level = fetch_coursera_meta(slug)
            link = f"https://www.coursera.org/learn/{slug}"

            course_data = {
                "course_title": title,
                "course_link": link,
                "course_description": description,
                "course_image": image,
                "slug": slug,
                "provider_names": provider_names,
                "provider_details": provider_details,  
                "domains": domains,
                "subdomains": subdomains,
                "coursera_skills": coursera_skills,
                "course_level": course_level,
            }

            doc_ref.set(course_data, merge=True)

            if doc_snap.exists:
                total_skipped += 1
                print(f"[update] updated course {slug}")
            else:
                total_saved += 1
                print(f"[insert] saved new course {slug}")

        start += limit

    return jsonify({
        "message": "Courses processed",
        "saved": total_saved,
        "skipped_existing": total_skipped,
        "total_received": total_received,
        "max_new_limit": max_new,
    })

# ---------------------------------------------
# Speech-to-Text route

@app.route("/speech_to_text", methods=["POST"])
def speech_to_text():
    google_api_key = os.environ.get("GOOGLE_SPEECH_API_KEY")
    if not google_api_key:
        return jsonify({"error": "GOOGLE_SPEECH_API_KEY not set"}), 500

    data = request.get_json() or {}
    audio_content = data.get("audioContent")
    config = data.get("config", {})

    if not audio_content:
        return jsonify({"error": "audioContent (base64) is required"}), 400

    try:
        raw_bytes = base64.b64decode(audio_content)
        audio = AudioSegment.from_file(io.BytesIO(raw_bytes))
        buf = io.BytesIO()
        audio.export(buf, format="wav", parameters=["-acodec", "pcm_s16le"])
        pcm_base64 = base64.b64encode(buf.getvalue()).decode("utf-8")

        stt_config = {
            "encoding": "LINEAR16",
            "languageCode": config.get("languageCode", "en-US"),
            "enableAutomaticPunctuation": True,
        }

        body = {"config": stt_config, "audio": {"content": pcm_base64}}

        url = f"https://speech.googleapis.com/v1/speech:recognize?key={google_api_key}"
        resp = requests.post(url, json=body)
        resp_json = resp.json()
        print("Google STT raw response:", resp_json)

        if "error" in resp_json:
            print("Google STT error:", resp_json["error"])
            return jsonify({"error": resp_json["error"]}), 500

        results = resp_json.get("results", [])
        transcript_parts = []

        for result in results:
            alts = result.get("alternatives", [])
            if not alts:
                continue
            best = alts[0].get("transcript", "")
            if best:
                transcript_parts.append(best)

        transcript = " ".join(transcript_parts).strip()


        return jsonify({"transcript": transcript, "raw": resp_json})

    except Exception as e:
        print("Error converting or calling Google STT:", e)
        return jsonify({"error": "Internal STT error"}), 500

@app.route("/learning_path", methods=["POST"])
def learning_path():
    data = request.get_json() or {}
    user_skills_raw = data.get("skills", [])
    field_of_study = data.get("field_of_study")  # 

    if not user_skills_raw:
        return jsonify({"error": "skills list required"}), 400

    # 1) Normalize user skills
    user_skills = normalize_skills(user_skills_raw)

    predicted_category = None
    if job_category_model is not None:
        try:
            vec = build_feature_vector(user_skills, field_of_study)
            probs = job_category_model.predict_proba([vec])[0]
            idx = int(np.argmax(probs))
            predicted_category = label_encoder.inverse_transform([idx])[0]
            print("[learning_path] MLP predicted category:", predicted_category)
        except Exception as e:
            print("[learning_path] MLP prediction error:", e)
    else:
        print("[learning_path] job_category_model is None")


    if not predicted_category:
        return jsonify({
            "error": "Could not predict a job category from skills.",
            "user_skills": user_skills,
        }), 400

    # 3) Map category label to Coursera domain string
    mapped_domain = map_category_to_domain(predicted_category)
    if not mapped_domain:
        return jsonify({
            "error": "Could not map predicted category to course domain.",
            "predicted_category": predicted_category,
            "user_skills": user_skills,
        }), 400

    print("[learning_path] mapped_domain:", mapped_domain)

    # 4) Fetch all courses that belong to this domain
    try:
        q = (
            db.collection("courses")
            .where("domains", "array_contains", mapped_domain)
        )
        course_docs = list(q.stream())
    except Exception as e:
        print("[learning_path] Firestore domain query error:", e)
        return jsonify({"error": "Firestore query error", "details": str(e)}), 500

    if not course_docs:
        return jsonify({
            "error": "No courses found for mapped domain.",
            "predicted_category": predicted_category,
            "mapped_domain": mapped_domain,
            "user_skills": user_skills,
        }), 400

    # 5) Build domain skill set from all courses in this domain (data-driven)
    skill_counter = Counter()
    for doc_snap in course_docs:
        cdata = doc_snap.to_dict() or {}
        cskills = normalize_skills(cdata.get("coursera_skills", []))
        skill_counter.update(cskills)

    if not skill_counter:
        return jsonify({
            "error": "No skills found in courses for this domain.",
            "predicted_category": predicted_category,
            "mapped_domain": mapped_domain,
            "user_skills": user_skills,
        }), 400

    # keep skills that appear at least 2 times, top 50
    domain_skills = [
        skill
        for skill, freq in skill_counter.most_common()
        if freq >= 2
    ][:50]

    domain_skills = normalize_skills(domain_skills)

    user_skill_set = set(user_skills)
    domain_skill_set = set(domain_skills)

    # 6) Skill gap
    have_skills = sorted(list(user_skill_set & domain_skill_set))
    missing_skills = sorted(list(domain_skill_set - user_skill_set))

    # 7) Build course list that covers missing skills
    missing_set = set(missing_skills)
    courses_list = []

    for doc_snap in course_docs:
        cdata = doc_snap.to_dict() or {}
        cskills = normalize_skills(cdata.get("coursera_skills", []))

        covers = sorted(list(missing_set & set(cskills))) if missing_skills else []

        # If there are missing skills, prefer courses that cover at least 1
        if missing_skills and not covers:
            continue

        courses_list.append({
            "course_id": doc_snap.id,
            "course_title": cdata.get("course_title"),
            "course_description": cdata.get("course_description"),
            "course_image": cdata.get("course_image"),
            "course_link": cdata.get("course_link"),
            "provider_names": cdata.get("provider_names", []),
            "domains": cdata.get("domains", []),
            "subdomains": cdata.get("subdomains", []),
            "covers_skills": covers,
            "course_level": cdata.get("course_level"),
        })

    # If we filtered everything out (no course covers missing skills),
    # fall back to just showing some domain courses.
    if not courses_list:
        for doc_snap in course_docs:
            cdata = doc_snap.to_dict() or {}
            courses_list.append({
                "course_id": doc_snap.id,
                "course_title": cdata.get("course_title"),
                "course_description": cdata.get("course_description"),
                "course_image": cdata.get("course_image"),
                "course_link": cdata.get("course_link"),
                "provider_names": cdata.get("provider_names", []),
                "domains": cdata.get("domains", []),
                "subdomains": cdata.get("subdomains", []),
                "covers_skills": [],
                "course_level": cdata.get("course_level"),
            })

    # 8) Rank courses: easier first, then more missing skills covered
    ranked_courses = sorted(
        courses_list,
        key=lambda c: (
            level_rank(c.get("course_level")),
            -len(c.get("covers_skills") or []),
        ),
    )

    return jsonify({
        "predicted_category": predicted_category,
        "mapped_domain": mapped_domain,
        "field_of_study": field_of_study,
        "user_skills": user_skills,
        "domain_skills": domain_skills,
        "have_skills": have_skills,
        "missing_skills": missing_skills,
        "courses": ranked_courses[:30],
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
