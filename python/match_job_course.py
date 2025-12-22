# map_job_skills_embeddings.py

import firebase_admin
from firebase_admin import credentials, firestore
from sentence_transformers import SentenceTransformer, util
import torch

# ==========================
# 1. Firebase Setup
# ==========================
# If you already have a separate firebase_setup.py, you can import db from there instead.
# For now, we set it up directly here.

cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)

db = firestore.client()
print("✅ Connected to Firestore")


# ==========================
# 2. Load Embedding Model
# ==========================
# Using a pre-trained SentenceTransformer model for semantic similarity
print("⏳ Loading embedding model (all-MiniLM-L6-v2)...")
model = SentenceTransformer("all-MiniLM-L6-v2")
print("✅ Model loaded")


# ==========================
# 3. Build Coursera Skill Vocabulary
# ==========================

def build_coursera_skill_vocab():
    """
    Read all courses from 'courses' collection and collect a global set of Coursera skills.
    Assumes each course doc has a field 'coursera_skills': string[]
    """
    vocab = set()
    course_docs = db.collection("courses").stream()

    for doc in course_docs:
        data = doc.to_dict() or {}
        skills = data.get("coursera_skills") or []
        for s in skills:
            s_clean = str(s).strip()
            if s_clean:
                vocab.add(s_clean)

    vocab_list = sorted(vocab)
    print(f"✅ Coursera skills vocab built: {len(vocab_list)} unique skills.")
    return vocab_list


COURSERA_SKILLS = build_coursera_skill_vocab()

print("⏳ Encoding Coursera skill embeddings...")
coursera_skill_embeddings = model.encode(
    COURSERA_SKILLS,
    convert_to_tensor=True,
    normalize_embeddings=True,  
)
print("✅ Coursera skill embeddings ready.")


# ==========================
# 4. Mapping function: job_skill_set → Coursera skills
# ==========================

def map_job_skills_to_coursera(job_skills_raw):
    job_skills = [s for s in (job_skills_raw or []) if str(s).strip()]
    if not job_skills:
        return []

    job_embeddings = model.encode(
        job_skills,
        convert_to_tensor=True,
        normalize_embeddings=True,
    )

    cos_sim_matrix = util.cos_sim(job_embeddings, coursera_skill_embeddings)

    mapped = []
    for i, skill in enumerate(job_skills):
        best_idx = int(torch.argmax(cos_sim_matrix[i]))
        best_skill = COURSERA_SKILLS[best_idx]
        best_score = float(cos_sim_matrix[i][best_idx]) 

        mapped.append({
            "job_skill_raw": skill,
            "mapped_coursera_skill": best_skill,
            "similarity": best_score,
        })

    return mapped


# ==========================
# 5. Update all job documents
# ==========================

def update_all_jobs_with_coursera_mapping():
    job_docs = db.collection("job").stream()

    for doc in job_docs:
        data = doc.to_dict() or {}

        raw_job_skills = data.get("job_skill_set") or []

        if not raw_job_skills:
            print(f"[{doc.id}] No job_skill_set, skipping.")
            continue

        mappings = map_job_skills_to_coursera(raw_job_skills)

        coursera_names = sorted(
            {m["mapped_coursera_skill"] for m in mappings}
        )

        print(
            f"[{doc.id}] {len(raw_job_skills)} raw skills -> "
            f"{len(coursera_names)} Coursera skills."
        )

        db.collection("job").document(doc.id).update({
            "job_skill_coursera": coursera_names,
            "job_skill_mapping_debug": mappings, 
        })


if __name__ == "__main__":
    update_all_jobs_with_coursera_mapping()
    print("✅ Finished updating job_skill_coursera for all jobs.")
