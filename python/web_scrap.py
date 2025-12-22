import re
import ast
import os
import time
import requests
import pandas as pd
from bs4 import BeautifulSoup
from datetime import datetime
from collections import defaultdict, Counter
from urllib.parse import urlparse, urlunparse, quote_plus
import firebase_admin
from firebase_admin import credentials, firestore, storage
from deep_translator import GoogleTranslator
from jobTranslate import classify_job_function
from sentence_transformers import SentenceTransformer, util
import torch

# =====================================
# Firebase Setup
# =====================================
cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred, {
    "storageBucket": "careerguildancesystem.firebasestorage.app"
})
model = SentenceTransformer("all-MiniLM-L6-v2")
db = firestore.client()
bucket = storage.bucket()
print(f"✅ Using storage bucket: {bucket.name}")

# Build an absolute path for the fallback icon
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_LOGO_PATH = os.path.join(BASE_DIR, "assets", "icon.png")


def normalize_linkedin_url(url: str) -> str:
    if not url:
        return ""

    url = url.strip()
    parsed = urlparse(url)

    # unify host if needed
    netloc = parsed.netloc
    if netloc.endswith("linkedin.com") and netloc != "www.linkedin.com":
        netloc = "www.linkedin.com"

    cleaned = parsed._replace(
        netloc=netloc,
        query="",      # remove ?position=...&refId=...
        fragment="",   # remove #something
    )
    return urlunparse(cleaned)


# =====================================
def translate(text: str):
    if not text:
        return text
    try:
        return GoogleTranslator(source="auto", target="en").translate(text)
    except Exception:
        return text


# =====================================
# LinkedIn Scraping Config (generic fallback)
# =====================================
BASE_URL = (
    "https://www.linkedin.com/jobs/search/?"
    "location=Malaysia&"
    "geoId=106808692"
)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}


# =====================================
# Optional: get existing job links (avoid duplicates)
# =====================================
def get_existing_job_links():
    existing_links = set()
    job_docs = db.collection("job").stream()
    for doc in job_docs:
        data = doc.to_dict() or {}
        link = data.get("link")
        if link:
            norm = normalize_linkedin_url(link)
            existing_links.add(norm)
    print(f"Found {len(existing_links)} existing job links in Firestore (normalized).")
    return existing_links


# =====================================
# Build LinkedIn URL using dataset job_category as keywords
# =====================================
def build_linkedin_search_url_from_category(job_category: str) -> str:
    """
    Use dataset job_category as LinkedIn 'keywords' search term.
    Example: 'Data Analyst' -> keywords=Data+Analyst
    """
    if not job_category:
        job_category = ""
    kw = job_category.strip()
    encoded_kw = quote_plus(kw)  # space -> + or %20

    url = (
        "https://www.linkedin.com/jobs/search/?"
        f"keywords={encoded_kw}&"
        "location=Malaysia&"
        "geoId=106808692"
    )
    return url


# =====================================
# Scrape job list (title, location, link, company, company profile link)
# =====================================
def scrape_linkedin_jobs(base_url: str, pages: int = 5, step: int = 25) -> pd.DataFrame:
    titles, locations, countries, links, company_names, company_profile_links = [], [], [], [], [], []

    for page_idx in range(pages):
        start = page_idx * step
        url = f"{base_url}&start={start}"
        print(f"Requesting page {page_idx+1}: start={start}")
        try:
            resp = requests.get(url, headers=HEADERS)
        except Exception as e:
            print(f"  ⚠️ Request error on page {page_idx+1}: {e}")
            continue

        if resp.status_code != 200:
            print(f"  ⚠️ Page failed: status {resp.status_code}")
            continue

        soup = BeautifulSoup(resp.text, "html.parser")

        for t in soup.find_all("h3", {"class": "base-search-card__title"}):
            titles.append(t.get_text(strip=True))

        for loc in soup.find_all("span", {"class": "job-search-card__location"}):
            loc_text = loc.get_text(strip=True)
            locations.append(loc_text)
            countries.append(loc_text.split(",")[-1].strip())

        for a in soup.find_all("a", {"class": "base-card__full-link"}):
            raw_href = a["href"]
            norm_href = normalize_linkedin_url(raw_href)
            links.append(norm_href)

        # Company name + company profile link
        for c in soup.find_all("a", {"class": "hidden-nested-link"}):
            company_names.append(c.get_text(strip=True))

            href = (c.get("href") or "").strip()
            if href:
                company_profile_links.append(normalize_linkedin_url(href))
            else:
                company_profile_links.append("")  # keep list aligned

    size = min(
        len(titles),
        len(locations),
        len(countries),
        len(links),
        len(company_names),
        len(company_profile_links),
    )

    df = pd.DataFrame({
        "title": titles[:size],
        "location": locations[:size],
        "country": countries[:size],
        "link": links[:size],
        "company_name": company_names[:size],
        "company_profile_link": company_profile_links[:size],
    })
    df = df.drop_duplicates(subset=["link"]).reset_index(drop=True)
    print(f"Scraped {len(df)} unique jobs from LinkedIn list.")
    return df


# =====================================
# Filter: Malaysia Jobs
# =====================================
def filter_malaysia(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    mask = (
        df["country"].str.contains("Malaysia", case=False, na=False)
        | df["location"].str.contains("Malaysia", case=False, na=False)
        | df["location"].str.contains("Kuala Lumpur", case=False, na=False)
        | df["location"].str.contains("Selangor", case=False, na=False)
        | df["location"].str.contains("Penang", case=False, na=False)
        | df["location"].str.contains("Johor", case=False, na=False)
    )
    df_my = df[mask].copy()
    print(f"Filtered to {len(df_my)}/{len(df)} Malaysia jobs.")
    return df_my


# =====================================
# Extract company logo from job page
# =====================================
def scrape_company_logo(soup: BeautifulSoup) -> str | None:
    """
    Extract company logo image from LinkedIn job page using multiple strategies:
    - <img> tags with src / data-delayed-url / data-ghost-url / data-src
    - <meta property="og:image"> as a fallback
    """

    candidates = [
        "img[alt*='company logo']",
        "img[alt*='Company Logo']",
        "img[alt*='logo']",
        "img.ivm-view-attr__img--centered",
        "img.ivm-view-attr__img",
        "img.artdeco-entity-image",
        "img.artdeco-entity-image-square-4",
        "img.artdeco-entity-image-square-5",
        "div.ivm-image-view-model img",
        "div.ivm-view-attr__img-wrapper img",
        "img.lazy-image",
        "img.company-logo",
        "img.ember-view",
    ]

    def clean_url(url: str) -> str | None:
        if not url:
            return None
        url = url.strip()
        if url.startswith("data:image"):
            return None
        if url.startswith("//"):
            url = "https:" + url
        return url

    for selector in candidates:
        img = soup.select_one(selector)
        if not img:
            continue

        for attr in ["src", "data-delayed-url", "data-ghost-url", "data-src"]:
            if attr in img.attrs:
                url = clean_url(img.attrs.get(attr, ""))
                if url:
                    return url

        srcset = img.attrs.get("srcset")
        if srcset:
            first_part = srcset.split(",")[0].strip()
            first_url = first_part.split(" ")[0]
            url = clean_url(first_url)
            if url:
                return url

    og = soup.find("meta", {"property": "og:image"})
    if og and og.get("content"):
        url = clean_url(og["content"])
        if url:
            return url

    return None


# =====================================
# Upload company logo → Firebase Storage
# If logo_url is None or fails, use assets/icon.png
# =====================================
def upload_company_logo(company_name: str, logo_url: str | None) -> str:
    safe_name = (
        company_name.lower()
        .replace(" ", "_")
        .replace("/", "_")
        .replace("\\", "_")
    )
    blob = bucket.blob(f"company_logos/{safe_name}.jpg")

    # helper to upload fallback
    def upload_fallback() -> str:
        if not os.path.exists(DEFAULT_LOGO_PATH):
            print("Fallback icon not found, returning empty logo URL.")
            return ""
        try:
            print("Uploading local fallback icon...")
            blob.upload_from_filename(DEFAULT_LOGO_PATH)
            blob.make_public()
            return blob.public_url
        except Exception as e:
            print(f"Failed to upload fallback icon: {e}")
            return ""

    try:
        if not logo_url:
            print(f"  ℹ️ No logo URL for '{company_name}', using fallback icon.")
            return upload_fallback()

        print(f"  🌐 Downloading logo for '{company_name}' from {logo_url}")
        img_resp = requests.get(logo_url, timeout=8)
        img_resp.raise_for_status()
        img_data = img_resp.content

        blob.upload_from_string(img_data, content_type="image/jpeg")
        blob.make_public()
        return blob.public_url

    except Exception as e:
        print(f"  ⚠️ Logo upload failed for '{company_name}'. Error: {e}")
        return upload_fallback()


# =====================================
# Scrape Job Detail Page (with logo URL)
# =====================================
def get_job_details(job_url: str) -> dict | None:
    try:
        time.sleep(1.5)
        resp = requests.get(job_url, headers=HEADERS)
        if resp.status_code != 200:
            print(f"Detail page status {resp.status_code} for {job_url}")
            return None

        soup = BeautifulSoup(resp.text, "html.parser")

        desc_tag = (
            soup.find("div", {"class": "show-more-less-html__markup"})
            or soup.find("div", {"class": "description__text"})
            or soup.find("div", {"class": "description"})
        )
        description = desc_tag.get_text(" ", strip=True) if desc_tag else None

        if not description:
            print("No description found, skipping job.")
            return None

        criteria_tags = soup.find_all(
            "span", {"class": "description__job-criteria-text"}
        )
        criteria = [t.get_text(strip=True) for t in criteria_tags]

        seniority = criteria[0] if len(criteria) > 0 else None
        job_type = criteria[1] if len(criteria) > 1 else None
        job_function = criteria[2] if len(criteria) > 2 else None
        industry = criteria[3] if len(criteria) > 3 else None

        logo_url = scrape_company_logo(soup)

        return {
            "description": description,
            "seniority": seniority,
            "job_type": job_type,
            "job_function": job_function,
            "industry": industry or "Unknown",
            "logo_url": logo_url,
        }

    except Exception as e:
        print("Error parsing job details:", e)
        return None


# =====================================
# Upload Jobs to Firestore (+ logos to Storage)
# =====================================
def upload_jobs_to_firestore(df: pd.DataFrame, limit: int = 200):
    df_limited = df.head(limit).reset_index(drop=True)
    print(f"Uploading up to {len(df_limited)} jobs...")

    existing_links = get_existing_job_links()
    saved = 0

    for idx, row in df_limited.iterrows():
        raw_link = row["link"]
        link = normalize_linkedin_url(raw_link)

        # company profile link from search results
        raw_company_profile_link = row.get("company_profile_link", "")
        company_profile_link = (
            normalize_linkedin_url(raw_company_profile_link)
            if raw_company_profile_link
            else ""
        )

        if link in existing_links:
            print(f"[{idx+1}] Skipped existing job: {row['title']} ({link})")
            continue

        print(f"[{idx+1}] Processing job: {row['title']}")
        time.sleep(2.5)

        details = get_job_details(link)
        if details is None:
            print("   → Skipped job (missing details).")
            continue

        job_name = translate(row["title"])
        company_name = translate(row["company_name"])
        job_location = translate(row["location"])
        job_description = translate(details["description"])
        job_function_translated = translate(details["job_function"])
        job_type_translated = translate(details["job_type"])
        industry_translated = translate(details["industry"])

        # classify_job_function should return your NEW job_category labels
        combined_text = f"{job_name}. {job_function_translated or ''}. {job_description[:400]}"
        category = classify_job_function(combined_text)

        logo_public_url = upload_company_logo(company_name, details["logo_url"])

        doc_ref = db.collection("job").document()
        job_id = doc_ref.id

        job_doc = {
            "job_id": job_id,
            "job_name": job_name,
            "company_name": company_name,
            "company_logo": logo_public_url,
            "job_location": job_location,
            "link": link,
            "company_profile_link": company_profile_link,
            "job_description": job_description,
            "job_type": job_type_translated,
            "job_function": job_function_translated,
            "job_category": category,  # e.g. "Data Analyst", "Software Engineer"
            "industry": industry_translated,
            "job_salary": "-",
            "scraped_at": timestamp,
        }

        doc_ref.set(job_doc)
        saved += 1

    print(f"✅ Saved {saved} new jobs to Firestore.")


# =====================================
# Skill Extraction Setup (SMART, CATEGORY-BASED)
#   UPDATED TO USE NEW DATASET
# =====================================

TRAINING_DATASET_PATH = "training_job_dataset.csv"


def parse_skill_list(skill_str: str) -> list[str]:
    """
    Convert 'python | sql | excel' (or comma-separated)
    into a clean list of lowercase skill tokens.
    """
    if not isinstance(skill_str, str):
        return []
    parts = re.split(r"[|,]", skill_str)
    out = []
    for p in parts:
        s = p.strip().lower()
        if s:
            out.append(s)
    return out


def normalize_category(cat: str) -> str:
    """
    Normalize job_category in a way that matches both:
    - values in training_job_dataset.csv
    - values saved in Firestore 'job_category'
    We assume classify_job_function() returns the same labels.
    """
    if not cat:
        return ""
    # lowercase, collapse multiple spaces
    cat = cat.strip().lower()
    cat = re.sub(r"\s+", " ", cat)
    return cat


print(f"📁 Loading training dataset for skill vocab: {TRAINING_DATASET_PATH}")
df_all_jobs = pd.read_csv(TRAINING_DATASET_PATH)

required_cols = {"job_category", "skills"}
missing = required_cols - set(df_all_jobs.columns)
if missing:
    raise ValueError(f"Dataset {TRAINING_DATASET_PATH} missing columns: {missing}")

# Build category frequency from dataset job_category
category_counts = Counter(
    df_all_jobs["job_category"]
    .astype(str)
    .str.strip()
    .str.lower()
)
DATASET_CATEGORIES = [cat for cat, _ in category_counts.most_common()]

print("📊 Dataset job categories (by frequency):")
for cat, cnt in category_counts.most_common():
    print(f"  {cat} → {cnt} rows")

CATEGORY_SKILLS_FREQ: dict[str, Counter] = defaultdict(Counter)

for _, row in df_all_jobs.iterrows():
    raw_cat = row.get("job_category", "") or ""
    norm_cat = normalize_category(raw_cat)
    if not norm_cat:
        continue

    raw_skills = row.get("skills", "") or ""
    skill_list = parse_skill_list(raw_skills)

    for skill in skill_list:
        if len(skill) < 2:
            continue
        CATEGORY_SKILLS_FREQ[norm_cat][skill] += 1

CATEGORY_SKILLS: dict[str, set[str]] = defaultdict(set)

MIN_FREQ = 2  # appear at least twice in that category

for cat, counter in CATEGORY_SKILLS_FREQ.items():
    for skill, count in counter.items():
        if count >= MIN_FREQ:
            CATEGORY_SKILLS[cat].add(skill)

print("✅ Built skill vocab for", len(CATEGORY_SKILLS), "categories.")
# Optional: print sample
for cat, skills in list(CATEGORY_SKILLS.items())[:5]:
    print(f"  {cat} → {len(skills)} skills (e.g. {list(skills)[:5]})")


def normalize_job_category_for_firestore(cat: str) -> str:
    return normalize_category(cat)


def find_skills_in_description(desc: str, skills: set[str]) -> list[str]:
    """
    Match skills from `skills` inside the job description `desc`,
    case-insensitively. So 'c#' in dataset will match 'C#', 'c#', etc.
    """
    if not desc:
        return []

    desc_lower = desc.lower()
    matched: list[str] = []

    single_word_skills: list[str] = []
    phrase_skills: list[str] = []

    for s in skills:
        s_clean = (s or "").strip()
        if not s_clean:
            continue

        # skills in CATEGORY_SKILLS are already lowercase from parse_skill_list,
        # but we normalize again just to be safe
        if " " in s_clean:
            phrase_skills.append(s_clean.lower())
        else:
            single_word_skills.append(s_clean.lower())

    # phrase matching (case-insensitive via desc_lower)
    for phrase in phrase_skills:
        if phrase in desc_lower:
            matched.append(phrase)

    # single-word matching with word boundaries, case-insensitive
    for word in single_word_skills:
        pattern = r"\b" + re.escape(word) + r"\b"
        if re.search(pattern, desc, flags=re.IGNORECASE):
            matched.append(word)

    # remove duplicates, keep order
    seen = set()
    unique_matched: list[str] = []
    for m in matched:
        if m not in seen:
            seen.add(m)
            unique_matched.append(m)

    return unique_matched



def update_job_skills():

    job_docs = db.collection("job").stream()

    for doc in job_docs:
        data = doc.to_dict() or {}

        desc = data.get("job_description") or ""
        raw_category = (data.get("job_category") or "").strip()
        norm_cat = normalize_job_category_for_firestore(raw_category)

        cat_skills = CATEGORY_SKILLS.get(norm_cat, set())

        if not cat_skills:
            print(f"[{doc.id}] No skills vocab for category '{norm_cat}' (raw='{raw_category}')")
            continue

        matched = find_skills_in_description(desc, cat_skills)

        print(f"[{doc.id}] category='{raw_category}' matched {len(matched)} skills.")

        db.collection("job").document(doc.id).update({
            "job_skill_set": matched
        })


# =====================================
# Coursera skill vocab & embeddings
# =====================================
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


# =====================================
# Scrape by dataset job_category (≈20 jobs per category)
# =====================================
def scrape_jobs_for_dataset_categories(
    per_category: int = 10,
    max_categories: int | None = 10,
    pages: int = 5,
    step: int = 25,
) -> pd.DataFrame:
    if not DATASET_CATEGORIES:
        print("⚠️ No dataset categories found; falling back to single BASE_URL search.")
        return scrape_linkedin_jobs(BASE_URL, pages=pages, step=step)

    if max_categories is not None:
        categories = DATASET_CATEGORIES[:max_categories]
    else:
        categories = DATASET_CATEGORIES

    all_dfs: list[pd.DataFrame] = []

    for cat in categories:
        print(f"\n===== Scraping for dataset category: '{cat}' =====")
        search_url = build_linkedin_search_url_from_category(cat)
        print(f"Search URL: {search_url}")

        df_cat = scrape_linkedin_jobs(search_url, pages=pages, step=step)

        if df_cat.empty:
            print(f"  ⚠️ No jobs found for category '{cat}'")
            continue

        df_cat["dataset_category"] = cat

        if len(df_cat) > per_category:
            df_cat = df_cat.head(per_category).copy()

        all_dfs.append(df_cat)

    if not all_dfs:
        print("⚠️ No jobs scraped for any dataset categories.")
        return pd.DataFrame(
            columns=[
                "title",
                "location",
                "country",
                "link",
                "company_name",
                "company_profile_link",
                "dataset_category",
            ]
        )

    merged = pd.concat(all_dfs, ignore_index=True)
    merged = merged.drop_duplicates(subset=["link"]).reset_index(drop=True)
    print(f"\n✅ Total unique jobs scraped across dataset categories: {len(merged)}")
    return merged

def reclassify_job_categories(limit: int | None = None):
    """
    Re-run category classification for existing jobs in Firestore
    using the improved classify_job_function().

    - Builds combined text: job_name + job_function + job_description
    - Calls classify_job_function(combined_text)
    - Updates 'job_category' field when it changes
    """
    job_docs = db.collection("job").stream()
    count = 0
    updated = 0

    for doc in job_docs:
        data = doc.to_dict() or {}
        job_name = (data.get("job_name") or "").strip()
        job_function = (data.get("job_function") or "").strip()
        job_description = (data.get("job_description") or "").strip()
        old_cat = (data.get("job_category") or "").strip()

        combined_text = f"{job_name}. {job_function}. {job_description[:400]}"
        new_cat = classify_job_function(combined_text)

        if new_cat and new_cat != old_cat:
            db.collection("job").document(doc.id).update({
                "job_category": new_cat
            })
            print(f"[{doc.id}] job_category updated: '{old_cat}' -> '{new_cat}'")
            updated += 1

        count += 1
        if limit is not None and count >= limit:
            break

    print(f"✅ Reclassified {count} jobs total, {updated} had changes.")

# =====================================
# MAIN
# =====================================
if __name__ == "__main__":
   # df_all = scrape_jobs_for_dataset_categories(
   #     per_category=6,     
   #     max_categories=None,   
   #     pages=5,
   #     step=25,
   # )

    #df_my = filter_malaysia(df_all)

    #if not df_my.empty:
    #    upload_jobs_to_firestore(df_my, limit=200)
    #    update_job_skills()
    #else:
     #   print("No Malaysia jobs found.")

    reclassify_job_categories(limit=None)  # or e.g. limit=50 for testing
    update_job_skills()
