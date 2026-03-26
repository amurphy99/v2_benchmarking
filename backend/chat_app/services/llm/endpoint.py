"""
Build LLM API endpoint access (URL and API key).
--------------------------------------------------------------------------------
`backend.chat_app.services.llm.endpoint`

TODO: Make this flexible...
TODO: Maybe put something in config?
TODO: Log something about this configuration upon startup

"""
import os


# Initialize static variables from the environment
LLM_URL = os.getenv("IU_URL", "http://127.0.0.1:8080/v1")
API_KEY = os.getenv("IU_KEY", "DEFAULT_TOKEN"           ) # Absolutely will not work with the default values

# Model configuration
MODEL_NAME  = "llama-4-scout"  # TODO: Maybe grab this from the environment as well
TEMPERATURE = 0.50

