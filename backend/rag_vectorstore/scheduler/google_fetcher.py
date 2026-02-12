import os
import json
import asyncio
import logging
import requests
from datetime import datetime
from bs4 import BeautifulSoup
from django.conf import settings
from asgiref.sync import sync_to_async
from dotenv import load_dotenv  # <-- ADDED

# 1. Load environment variables from .env file
load_dotenv()

# Import your models and config
from rag_vectorstore.models import RagInstruction


from rag_vectorstore import config as cf

logger = logging.getLogger(__name__)

# --- CONFIGURATION ---
# 2. Fetch the key from .env instead of a hardcoded string
SERPER_API_KEY = os.getenv('SERPER_API_KEY')
SERPER_URL = "https://google.serper.dev/search"

# Safety check: Stop if the API key is missing
if not SERPER_API_KEY:
    logger.error("CRITICAL ERROR: SERPER_API_KEY is not set in the .env file.")

TOPICS = {
    "Dream Car": (
        "Latest luxury and dream car trends 2026, top-rated high-performance electric vehicles (EVs), "
        "AI-integrated cabin technology in modern cars, and most anticipated releases."
    ),
    "Modern Communication": (
        "Modern communication technology 2026 overview, impact of AI assistants, "
        "transition from landlines to 5G/6G and video conferencing roles."
    ),
    "Moon Landing": (
        "Status of NASA's Artemis II and III missions in 2026, private lunar landings (SpaceX, Blue Origin), "
        "and international lunar exploration updates."
    )
}

# --- SEARCH & SCRAPE LOGIC ---

def serper_search(query: str) -> dict:
    payload = json.dumps({"q": query})
    headers = {"X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json"}
    try:
        response = requests.post(SERPER_URL, headers=headers, data=payload, timeout=15)
        return response.json() if response.status_code == 200 else {}
    except Exception as e:
        logger.error(f"Serper search failed: {e}")
        return {}

def extract_links(serper_json: dict) -> list:
    links = []
    for item in serper_json.get("organic", []):
        if item.get("link"): links.append(item.get("link"))
    return list(set(links)) 

def scrape_website_text(url: str) -> list:
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        res = requests.get(url, headers=headers, timeout=10)
        res.raise_for_status()
        soup = BeautifulSoup(res.text, "html.parser")
        
        for tag in soup(["script", "style", "nav", "footer", "header"]):
            tag.decompose()

        return [p.get_text(strip=True) for p in soup.find_all("p") if len(p.get_text()) > 80]
    except Exception:
        return []

# --- THE MAIN SYNC LOGIC ---

async def run_google_sync_logic():
    """
    Main entry point for the Scheduler.
    """
    if not SERPER_API_KEY:
        print("Missing SERPER_API_KEY. Sync aborted.")
        return

    logger.info("--- Starting Google Data Sync Scheduler ---")

    for topic_name, query in TOPICS.items():
        logger.info(f"Processing Topic: {topic_name}")
        
        search_data = serper_search(query)
        links = extract_links(search_data)
        
        for url in links:
            logger.info(f"Scraping: {url}")
            paragraphs = scrape_website_text(url)
            
            if not paragraphs:
                continue

            for para in paragraphs:
                try:
                    # 3. Vectorize via AI model
                    vector = await cf.embedding_model.aembed_query(para)

                    # 4. Save to Django DB
                    await sync_to_async(RagInstruction.objects.get_or_create)(
                        content=para,
                        defaults={
                            'category': f"google_sync_{topic_name.lower().replace(' ', '_')}",
                            'embedding': vector,
                        }
                    )
                except Exception as e:
                    logger.error(f"Failed to embed/save paragraph: {e}")

    logger.info("--- Google Data Sync Complete ---")

if __name__ == "__main__":
    asyncio.run(run_google_sync_logic())
