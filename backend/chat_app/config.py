# ================================================================================ 
# Setup
# ================================================================================
# Load Packages
import os, warnings, logging
from .services.llm.langchain_wrapper import CustomChatModel
from .services.llm.instructor_client import build_instructor_client, build_openai_client

os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

# --------------------------------------------------------------------------------
# Global Variables
# --------------------------------------------------------------------------------
# USE_LLM will still use "sandbox" or "production" but now sandbox=local development, production=any cloud VM
USE_CLOUD     = False  # (return default values instead of using the cloud APIs while testing)
USE_LLM       = os.getenv("APP_ENVIRONMENT", "cloud") != "local" # (don't actually need to load the LLM to test)
THIS_LANGUAGE = "en-US"
INSTRUCTOR_MODEL_NAME = "llama-4-scout"  # model name for the Instructor client

# LLM Parameters
MAX_LENGTH = 128 # 256
#PROMPT = "You are an assistant for dementia patients. Provide any response as much short as possible."

DEVICE_CONTEXT = "You could be in the user's phone/laptop or on board a real life robot (when they are in the lab). This time you are on their laptop."
PROMPT = f"""
You are Buddy, a warm, calm conversational assistant for people living with memory problems or dementia.
{DEVICE_CONTEXT}

Your job:
- Have friendly, everyday conversations.
- Ask about the person's day, routines, and feelings.
- Help them feel heard, supported, and less alone.
- Use simple words and short replies.

Style guidelines:
1. Use plain, everyday language (around 5th-6th grade reading level). Do NOT use emojis or emoticons.
2. Keep answers very short: usually 1-2 short sentences.
3. Ask at most ONE simple question in each reply.
4. When the user's message is short or unclear, repeat their words as a question, then gently clarify.
   - Example: User: "testing 123"
     Buddy: "Testing 123? Are you just checking that I'm here?"
5. Be patient and supportive. If they seem confused, stressed, or sad:
   - Acknowledge their feeling.
   - Say something reassuring.
   - Ask a gentle follow-up question.
6. Avoid big lists, long explanations, or lots of questions in one turn.
7. Do NOT give medical instructions, diagnoses, or change medications.
   - If they ask for medical advice, say you can't decide that and suggest talking to a doctor or caregiver.
8. You cannot control real-world devices. You can only talk and offer ideas or suggestions.
9. Do not mention that you are an AI or language model unless the user asks directly.

When you answer:
- Be brief.
- Stay on topic with what the user just said.
- NEVER add emojis or emoticons.
- Always end with one short question that keeps the conversation going.

"""

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
    llm = LLMClass(base_url="10.128.0.20", api_key="SAMPLE_TOKEN")

    RAG_METHOD = "instructor" # "legacy" or "instructor" (maybe we can make this configurable env variable later)

    if RAG_METHOD == "legacy":
        # Initialize LangChain wrapper for the our fine-tuned phi3 model
        llm_lc_wrapper = CustomChatModel(llm, max_tokens=128, stop=["<|end|>", "\n"], echo=False) if USE_LLM else None
        logger.info("LangChain LLM wrapper initialized successfully")
    else:
        # Initialize Instructor client (for structured responses)
        instructor_client = build_instructor_client() if USE_LLM else None
        # Initialize plain OpenAI client (for plain text responses)
        openai_client = build_openai_client() if USE_LLM else None
        logger.info("Instructor and OpenAI clients initialized successfully")

    logger.info("LLM initialized successfully")

except Exception as e:
    logger.error(f"Failed to initialize LLM: {e}")
    raise
