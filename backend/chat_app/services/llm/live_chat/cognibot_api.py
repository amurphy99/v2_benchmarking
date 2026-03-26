"""
Wrapper class for live-chat LLM calls using structured generation.
--------------------------------------------------------------------------------
`backend.chat_app.services.llm.live_chat.cognibot_api`

Provides a CognibotAPI instance that accepts a message history and returns a
structured CognibotResponse (thought + message + behavior) via the shared LLM 
endpoint.

"""
import logging, asyncio, time
logger = logging.getLogger(__name__)

# Structured generation imports
import instructor
from openai   import AsyncOpenAI
from pydantic import BaseModel, Field, ValidationError
from typing   import Literal

# From this project
from ....services import logging_utils as lu
from ....services.logging_utils import RESET, BOLD, UNBOLD, LLM_MAIN
from ....config                 import PROMPT, DEVICE_CONTEXT

# Shared endpoint config
from ..endpoint import LLM_URL, API_KEY, MODEL_NAME, TEMPERATURE


# --------------------------------------------------------------------------------
# Emotions and/or gestures available to the robots
# --------------------------------------------------------------------------------
# TODO: Add these to the response model
ConversationState = Literal["happy", "sad", "surprised", "thinking"]


# ================================================================================
# Define the Pydantic response Model
# ================================================================================
class CognibotResponse(BaseModel):
    # Thought field to help the LLM do some internal reasoning before responding
    thought : str = Field(..., description="Brief internal reasoning about how the conversation is going and how to continue.")

    # Final response to send to the user
    message : str = Field(..., description="Your spoken response to the user.")


# Default response (returned after all retries are exhausted)
DEFAULT_RESPONSE = CognibotResponse(
    thought = "FAILED",
    message = "I'm sorry, I'm having trouble thinking right now. Can you tell me more?",
)

# --------------------------------------------------------------------------------
# Build the System Prompt
# --------------------------------------------------------------------------------
# TODO: Maybe use the config prompt still?
# TODO: At least incorporate the source thing like the system prompt does
COGNIBOT_SYSTEM = f"""
You are Buddy, a warm, calm conversational assistant for people living with memory problems or dementia.
{DEVICE_CONTEXT}

Your job:
- Have friendly, everyday conversations.
- Ask about the person's day, routines, and feelings.
- Help them feel heard, supported, and less alone.
- Use simple words and short replies.

Go with the flow, if the user doesn't remember something, don't press them; switch to a different topic.
If the user changes the topic suddenly, you can try gently guiding them back to what you were talking about, but don't force it.
Talk about whatever they want to talk about.

GUIDELINES:
- Be warm, patient, and genuinely curious about the user.
- Use plain, everyday language (around 5th-6th grade reading level). Do NOT use emojis or emoticons.
- Keep responses concise and conversational (1-3 sentences max).
- Acknowledge what the user said in their last message, either by following up on it or by repeating it back to them for clarification.
- If it seems like the user has said something that doesn't make sense given the context, repeat it as a question and ask for clarification.
- ALWAYS end your response with a question.
- Do not give medical advice or make clinical assessments.

When you answer:
- Be brief.
- Stay on topic with what the user just said.
- NEVER add emojis or emoticons.
- Always end with one short question that keeps the conversation going.

OUTPUT FORMAT:
Return ONLY a single JSON object matching the provided schema (no markdown, no extra keys).
- `thought`: brief internal note on how the conversation is going and your intended approach.
- `message`: your spoken reply to the user.

""".strip()


# ================================================================================
# Wrapper class for communicating with externally hosted models
# ================================================================================
class CognibotAPI:
    """
    Expected environment variables:
      - IU_URL   (e.g. "http://10.128.0.5:8080/v1")
      - IU_KEY   (gateway token)
    """
    def __init__(self, model=MODEL_NAME, temperature=TEMPERATURE, max_retries=4):
        self.model       = model
        self.temperature = temperature
        self.max_retries = max_retries

        # Initialize an asynchronous OpenAI client instance that we will re-use
        # TODO: Is it better to close this more?
        self.client = instructor.from_openai(
            AsyncOpenAI(base_url=LLM_URL, api_key=API_KEY, timeout=20.0),
            mode=instructor.Mode.JSON,
        )

        # Log on initialization
        logger.info(f"{LLM_MAIN}[LLM] {BOLD}CognibotAPI{UNBOLD} initialized. URL: {LLM_URL}, model: {BOLD}{self.model}{RESET}")

    # ================================================================================
    # Call the LLM with retries
    # ================================================================================
    # TODO: This used to return the CognibotResponse, but to make it match the existing code, just return the message string
    async def __call__(self, messages: list[dict]) -> str:
        # Prepend system prompt to the provided message history
        full_messages = [{"role": "system", "content": COGNIBOT_SYSTEM}] + messages
        
        # --------------------------------------------------------------------------------
        # Try to get a response the given number of times
        # --------------------------------------------------------------------------------
        t0 = time.time()
        for attempt in range(self.max_retries + 1):
            try:
                response: CognibotResponse = await self.client.chat.completions.create(
                    model          = self.model,
                    response_model = CognibotResponse,
                    messages       = full_messages,
                    temperature    = self.temperature,
                )
                t1 = time.time()
                log_response(response, t0, t1)
                return response.message

            # --------------------------------------------------------------------------------
            # Catch errors and retry if a call fails
            # --------------------------------------------------------------------------------
            # Capture Pydantic response schema validation errors (i.e. the model didn't return proper JSON)
            except (ValidationError, Exception) as e:
                logger.info(
                    f"{LLM_MAIN}[LLM] Live-chat LLM call {lu.RED}{BOLD}FAILED{UNBOLD}{LLM_MAIN} "
                    f"(attempt {attempt+1}/{self.max_retries+1}): {repr(e)}{RESET}"
                )
                if attempt < self.max_retries:
                    await asyncio.sleep(5.0)

        return DEFAULT_RESPONSE


# ================================================================================
# Logging
# ================================================================================
def log_response(response: CognibotResponse, t0: float, t1: float):
    log_string = (
        f"{LLM_MAIN}[LLM] Live-chat {BOLD}response{UNBOLD} generated in ({BOLD}{(t1-t0):.2f}s{UNBOLD}):{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Thought: {UNBOLD}{response.thought}{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Message: {UNBOLD}{response.message}{RESET}"
    )
    logger.info(log_string)
