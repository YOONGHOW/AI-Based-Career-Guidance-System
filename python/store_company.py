import requests
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime
import re
import time

# 🔥 Google Knowledge Graph API Key
KG_API_KEY = "AIzaSyDSNH2tdsapBmA622OqaVOzp2_iO3y05Wg"

# Firebase setup
cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)
db = firestore.client()


def make_company_id(name: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9]+", "_", name.lower()).strip("_")
    return base or "unknown_company"


def search_company_kg(company_name: str):
    url = "https://kgsearch.googleapis.com/v1/entities:search"
    params = {
        "query": company_name,
        "key": KG_API_KEY,
        "limit": 1,
        "indent": True,
    }

    r = requests.get(url, params=params)

    if r.status_code != 200:
        print(f"⚠️ KG API error ({r.status_code}) for: {company_name}")
        return None

    data = r.json()

    # ⭐ If no match, just return None (we'll handle fallback in run_update)
    if "itemListElement" not in data or len(data["itemListElement"]) == 0:
        print(f"❌ No KG match: {company_name}")
        return None

    entity = data["itemListElement"][0]["result"]

    company_info = {
        "name": entity.get("name"),
        "description": entity.get("description"),
        "types": entity.get("@type", []),
        "kg_id": entity.get("@id"),
        "detailed_desc": entity.get("detailedDescription", {}).get("articleBody"),
        "website": entity.get("detailedDescription", {}).get("url"),
        "logo": entity.get("image", {}).get("contentUrl"),
    }

    return company_info


def update_company_firestore(company_id: str, data: dict):
    data["updated_at"] = datetime.utcnow().isoformat()

    company_ref = db.collection("company").document(company_id)

    if company_ref.get().exists:
        company_ref.update(data)
        print(f"♻️ Updated company: {company_id}")
    else:
        data["company_id"] = company_id
        data["created_at"] = data["updated_at"]
        company_ref.set(data)
        print(f"🆕 Created company: {company_id}")


def run_update():
    """
    - For every job:
        - compute company_id
        - update job.company_id
    - For each unique company:
        - try Google KG
        - if KG returns data → merge into company doc
        - if no KG data → still create company doc with name + LinkedIn profile URL
    """
    jobs = db.collection("job").stream()
    seen_companies = set()

    for doc in jobs:
        job_data = doc.to_dict() or {}

        company_name = job_data.get("company_name")
        if not company_name:
            continue

        company_id = make_company_id(company_name)

        # ⭐ Always update the job document with company_id
        try:
            db.collection("job").document(doc.id).update({
                "company_id": company_id
            })
            print(f"🔗 Set company_id for job {doc.id} → {company_id}")
        except Exception as e:
            print(f"⚠️ Failed to update job {doc.id} with company_id: {e}")

        # Only fetch KG / update company collection once per company
        if company_id in seen_companies:
            continue

        seen_companies.add(company_id)

        # Get LinkedIn profile URL from job (fallback)
        # Adjust key name if your field is different
        linkedin_profile = job_data.get("company_profile_link") or ""

        print(f"\n🔎 KG lookup for company: {company_name}")

        profile = search_company_kg(company_name)

        # ⭐ Base data that we will always store (even if KG has no result)
        company_doc_data = {
            "name": company_name,
            "company_profile_link": linkedin_profile,  # LinkedIn URL from your scraper
        }

        # ⭐ If KG found something, merge it on top
        if profile:
            company_doc_data.update(profile)
        else:
            print(f"ℹ️ Using fallback only (name + LinkedIn URL) for {company_name}")

        # Write to Firestore company collection
        update_company_firestore(company_id, company_doc_data)

        time.sleep(1.5)  # prevent rate-limit


if __name__ == "__main__":
    run_update()
