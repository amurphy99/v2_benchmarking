import requests, os
from pexels_api import API


def get_images(topic, source="pexels", n=1):
    # Define the API endpoint URL
    url = 'https://api.pexels.com/v1/search?query={topic}&per_page={n}&orientation=square'
    PEXELS_KEY = os.getenv("PEXELS_KEY")
    api = API(PEXELS_KEY)

    try:
        api.search(topic, page=1, results_per_page=n)
        photos = api.get_entries()
        if photos:
            url = photos[0].original
            photographer = photos[0].photographer
            photographer_url = photos[0].url
            return {
                "topic": topic,
                "url": url,
                "photographer": photographer,
                "photographer_url": photographer_url
            }
        else:
            return None
    except requests.exceptions.RequestException as e:
        print('Error:', e)
        return None
    except Exception as e:
        print('Unexpected error:', e)
        return None