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
USE_CLOUD     = False  # (return default values instead of using the cloud APIs while testing)
USE_LLM       = os.getenv("USE_LLM", "true").lower() == "true"  # Whether to initialize the real LLM clients
THIS_LANGUAGE = "en-US"
INSTRUCTOR_MODEL_NAME = os.getenv("LLM_NAME", "gemma-4-31B-it")  # model name for the Instructor client

# --------------------------------------------------------------------------------
# Live-Chat Response Generation
# --------------------------------------------------------------------------------
LIVE_CHAT_RESPONSE_MODES          = ("single_stage", "active_listening")                    # Supported standard-chat response pipelines
LIVE_CHAT_RESPONSE_MODE           = os.getenv("LIVE_CHAT_RESPONSE_MODE", "single_stage")    # Response pipeline selected once during backend startup
ACTIVE_LISTENING_GRACE_SEC        = 0.8                                                     # Extra silence allowed after an incomplete-turn assessment
ACTIVE_LISTENING_TIMEOUT_SEC      = 15.0                                                    # Maximum duration of each active-listening LLM request
ACTIVE_LISTENING_MAX_RETRIES      = 1                                                       # Additional attempts allowed after a failed structured response
ACTIVE_LISTENING_RETRY_DELAY_SEC  = 0.5                                                     # Delay between active-listening request attempts
ACTIVE_LISTENING_ASSESSMENT_TEMP  = 0.1                                                     # Low-variance temperature used for turn assessment
ACTIVE_LISTENING_RESPONSE_TEMP    = 0.5                                                     # Temperature used to generate the spoken response

# Reject invalid response modes during startup instead of waiting for a chat connection
if LIVE_CHAT_RESPONSE_MODE not in LIVE_CHAT_RESPONSE_MODES:
    raise ValueError(f"Unsupported LIVE_CHAT_RESPONSE_MODE: {LIVE_CHAT_RESPONSE_MODE!r}")
if (not USE_LLM) and (LIVE_CHAT_RESPONSE_MODE != "single_stage"):
    raise ValueError("USE_LLM=false is supported only with LIVE_CHAT_RESPONSE_MODE=single_stage")

# --------------------------------------------------------------------------------
# LLM Parameters
# --------------------------------------------------------------------------------
MAX_LENGTH = 128 # 256
#PROMPT = "You are an assistant for dementia patients. Provide any response as much short as possible."

# Prompt
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
""".strip()

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
# LLM & Other Models' Settings
# ================================================================================
# For checking the model files are there
current_path = os.path.dirname(os.path.abspath(__file__))

try:
    # Get paths to the saved models
    rf_model_path = "/websocket/biomarkers/rf_models"
    pronunciation_model_path = current_path + f"{rf_model_path}/pronunciation_rf_v4.pkl"
    prosody_model_path       = current_path + f"{rf_model_path}/prosody_rf_v1.pkl"

    # Use the hosted endpoint unless local testing explicitly selects the dummy
    if USE_LLM:  from .services.llm.live_chat.cognibot_api import CognibotAPI as LLMClass
    else:        from .services.llm.live_chat.dummy_LLM    import DummyLLM    as LLMClass
       
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
