"""
Build LLM API endpoint access (URL and API key).
--------------------------------------------------------------------------------
`backend.chat_app.services.llm.endpoint`

TODO: Make this flexible...

"""
import os


# Initialize static variables from the environment
API_KEY  = os.getenv("LLM_GATEWAY_TOKEN", "DEFAULT_TOKEN")
BASE_URL = os.getenv("LLM_BASE_URL",      "127.0.0.1"    )
#FULL_URL = f"http://{BASE_URL}:8080/v1"














