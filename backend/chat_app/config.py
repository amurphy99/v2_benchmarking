# ================================================================================ 
# Setup
# ================================================================================
# Load Packages
import os, warnings, logging

os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

# --------------------------------------------------------------------------------
# Global Variables
# --------------------------------------------------------------------------------
# USE_LLM will still use "sandbox" or "production" but now sandbox=local development, production=any cloud VM
USE_CLOUD     = False  # (return default values instead of using the cloud APIs while testing)
USE_LLM       = os.getenv("APP_ENVIRONMENT", "cloud") != "local" # (don't actually need to load the LLM to test)
THIS_LANGUAGE = "en-US"

# LLM Parameters
MAX_LENGTH = 256
PROMPT = "You are an assistant for dementia patients. Provide any response as much short as possible."


# ================================================================================
# Logging Setup
# ================================================================================
# Ignore warnings
warnings.filterwarnings(action='ignore')

# Making the log folders if they do not exist
if not os.path.exists("./logs/"  ): os.mkdir("./logs/"  )
if not os.path.exists("./script/"): os.mkdir("./script/")

# Set up log file written format (ex: 01:39:09)
logging.basicConfig(
    format="%(asctime)s %(levelname)s: %(name)s: %(message)s",
    level=logging.DEBUG,
    filename='./logs/dm.log',
    # encoding='utf-8',
    datefmt="%H:%M:%S",
    #stream=sys.stderr,
)

logging.getLogger("chardet.charsetprober").disabled = True
logger = logging.getLogger(__name__)


# ================================================================================
# Testing Utilities
# ================================================================================
# Check for model files individually
def check_for_model_files(pronunciation_model_path, prosody_model_path):
    missing_files = []
    if not os.path.exists(pronunciation_model_path): missing_files.append(f"pronunciation_model_path: {pronunciation_model_path}")
    if not os.path.exists(      prosody_model_path): missing_files.append(f"prosody_model_path: {            prosody_model_path}")

    if len(missing_files) > 0:
        missing_str = f"Missing required file(s): {'; '.join(missing_files)}"
        logger.error           (missing_str)
        raise FileNotFoundError(missing_str)
    

# ================================================================================
# LLM & Other Models' Settings
# ================================================================================
# For checking the model files are there
current_path = os.path.dirname(os.path.abspath(__file__))

try:
    # Get paths to the saved models
    rf_model_path = "/websocket/biomarkers/rf_models"
    pronunciation_model_path = current_path + f"{rf_model_path}/pronunciation_rf_v4.pkl"
    prosody_model_path       = current_path + f"{rf_model_path}/prosody_rf_v1.pkl"

    # Make sure the saved models exist
    check_for_model_files(pronunciation_model_path, prosody_model_path)

    # Load the saved LLM model OR use a testing object that just returns sample data
    if USE_LLM:  from .services.llm.llama_api import LlamaAPI as LLMClass
    else:        from .services.llm.dummy_LLM import DummyLLM as LLMClass
       
    # Setup the LLM
    llm = LLMClass()
    logger.info("LLM initialized successfully")

except Exception as e:
    logger.error(f"Failed to initialize LLM: {e}")
    raise
