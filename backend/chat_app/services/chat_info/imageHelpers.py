"""
Retrieve an image to show for the chat.
--------------------------------------------------------------------------------
`backend.chat_app.services.chat_info.imageHelpers`

"""
import requests, os
from pexels_api import API
from django.db  import transaction, IntegrityError
from ...models  import AlbumImage

# Get API key from env
PEXELS_KEY = os.getenv("PEXELS_KEY")

# Default image if we fail to find one
DEFAULT_IMAGE = {
    "topic"            : "N/A",
    "url"              : "https://images.pexels.com/photos/356079/pexels-photo-356079.jpeg",
    "photographer"     : "Pixabay",
    "photographer_url" : "https://www.pexels.com/@pixabay/",
}


# ================================================================================
# Find an image (either cached or new) to put in the DB for the chat
# ================================================================================
def get_image_for_topics(topics):
    topics = [t.strip() for t in (topics or []) if t and t.strip()]
    if not topics: return pexels_to_album_image(DEFAULT_IMAGE)
    
    # 1) Check the DB for any cached images
    cached = _find_cached_album_image_for_topics(topics)
    if cached is not None: return cached  # AlbumImage

    # 2) Search for a image on Pexels if we didn't find one
    image_data = _fetch_pexels_image_for_topics(topics)
    return pexels_to_album_image(image_data) # converted to AlbumImage

# Check if there is an existing image for any of the given topics
# Keeps the topic order/priority by always returning the first cached AlbumImage
def _find_cached_album_image_for_topics(topics):
    if not topics: return None
    images = AlbumImage.objects.filter(topic__in=topics).only("id", "topic", "url", "photographer", "photographer_url")

    # Keep the original topic order (topics[0] first, then topics[1], etc.)
    by_topic = {img.topic: img for img in images}
    for t in topics:
        if t in by_topic: return by_topic[t]

    return None

# Convert a Pexels image dict into an AlbumImage DB row and return it
# Creates a new DB object
@transaction.atomic
def pexels_to_album_image(image_data):
    data     = image_data or DEFAULT_IMAGE
    topic    = (data.get("topic") or "N/A").strip()
    defaults = {
        "url"              : data.get("url",              DEFAULT_IMAGE["url"             ]),
        "photographer"     : data.get("photographer",     DEFAULT_IMAGE["photographer"    ]),
        "photographer_url" : data.get("photographer_url", DEFAULT_IMAGE["photographer_url"]),
    }

    try:                   obj, _ = AlbumImage.objects.get_or_create(topic=topic, defaults=defaults)
    except IntegrityError: obj    = AlbumImage.objects.get(topic=topic)
    return obj


# ================================================================================
# Use the Pexels API to find an image based on the chats topics
# ================================================================================
def _get_images(topic, source="pexels", n=1):
    # Define the API endpoint URL
    url = 'https://api.pexels.com/v1/search?query={topic}&per_page={n}&orientation=square'
    api = API(PEXELS_KEY)

    # Search for an image, always take the first result
    try:
        api.search(topic, page=1, results_per_page=n)
        photos = api.get_entries()
        if photos:
            return {
                "topic"            : topic,
                "url"              : photos[0].original,
                "photographer"     : photos[0].photographer,
                "photographer_url" : photos[0].url
            }
        else: return None

    except requests.exceptions.RequestException as e: print('Error:',            e); return None
    except Exception                            as e: print('Unexpected error:', e); return None

# --------------------------------------------------------------------------------
# Fetch image with retries for each topic in the list
# --------------------------------------------------------------------------------
def _fetch_pexels_image_for_topics(topics):
    if not topics: return DEFAULT_IMAGE

    # Loop through topics until we find an image
    for topic in topics:
        if not topic: continue
        image = _get_images(topic, "pexels", 1)
        if image: return image

    return DEFAULT_IMAGE
