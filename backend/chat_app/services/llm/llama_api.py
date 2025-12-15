import os
import logging
import json
import httpx
from ...services import logging_utils as lu

logger = logging.getLogger(__name__)

# ================================================================================
# Wrapper class for communicating with the LLM running on the GPU VM
# ================================================================================
class LlamaAPI:
    """
    Expected environment variables on the CPU VM:
      - LLM_BASE_URL       (e.g. "10.128.0.5")
      - LLM_GATEWAY_TOKEN  (the same token configured in nginx on the GPU VM)
    """
    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        timeout: float = 10.0,
        mode: str = "completion",  # completion or chat
        default_hyperparameters: dict | None = None,
    ):
        # Default to env vars so you can configure per environment
        self.api_key  = api_key  or os.getenv("LLM_GATEWAY_TOKEN")
        self.base_url = base_url or os.getenv("LLM_BASE_URL", "127.0.0.1")
        self.mode     = mode
        self.timeout  = timeout
        self.default_hyperparameters = default_hyperparameters or {}

        # "completions" (legacy endpoint) or "chat/completions" (newer api endpoint)
        # completion vs chat/completion: https://stackoverflow.com/questions/76192496/openai-v1-completions-vs-v1-chat-completions-end-points
        if self.mode == "completion":
            endpoint = "completions"
            self.full_url = f"http://{self.base_url}:8080/v1/{endpoint}"
        elif self.mode == "chat":
            endpoint = "chat/completions"
            self.full_url = f"http://{self.base_url}:8080/v1/{endpoint}"
        else:
            raise ValueError(f"Unknown mode={mode}. Use 'completion' or 'chat'.")

        # Log initialization
        logger.info(f"{lu.YELLOW}LLM API initialized, mode={self.mode}, base_url={self.base_url}{lu.RESET}")
        logger.info(f"{lu.YELLOW}Full URL: {self.full_url}{lu.RESET}")

        # API authorization key
        self.headers = {}
        if not self.api_key: logger.warning("LLM_GATEWAY_TOKEN (api_key) is not set - calls to nginx will be rejected (401).")
        else: self.headers["Authorization"] = f"Bearer {self.api_key}"

    # --------------------------------------------------------------------------------
    # Call the API at '/v1/completions'
    # --------------------------------------------------------------------------------
    async def __call__(
        self,
        prompt: str | None = None,
        *,
        messages: list[dict] | None = None,
        max_tokens: int = 64,
        stop: list[str] | None = None,
        echo: bool = False,
        temperature: float | None = None,
        top_p: float | None = None,
        top_k: int | None = None,
    ):
        # Prepare input (specifying which model to use)

        hyperparameters = dict(self.default_hyperparameters)
        if temperature is not None: hyperparameters["temperature"] = temperature
        if top_p is not None: hyperparameters["top_p"] = top_p
        if top_k is not None: hyperparameters["top_k"] = top_k

        if self.mode == "completion":
            if prompt is None:
                raise ValueError("mode='completion' requires prompt=...")

            llm_json = {
                "model": "models/Phi-3_finetuned.gguf", # maybe we can also make this a function attribute if we have more models in future
                "prompt": prompt,
                "max_tokens": max_tokens,
                "stop": stop or ["<|end|>", "\n"],
                "echo": echo,
                **hyperparameters,
            }

        else:  # chat/completion
            if messages is None:
                if prompt is None:
                    raise ValueError("mode='chat' requires messages=[...] or prompt=...")
                messages = [{"role": "user", "content": prompt}]
            
            llm_json = {
                "model": "models/Phi-3_finetuned.gguf",
                "messages": messages,
                "max_tokens": max_tokens,
                **({"stop": stop} if stop else {}),
                **hyperparameters,
            }

            if "messages" in llm_json:
                logger.info("Sending chat messages=%d, system_chars=%d",
                            len(llm_json["messages"]),
                            len(llm_json["messages"][0]["content"]) if llm_json["messages"] and llm_json["messages"][0]["role"]=="system" else -1)
            else:
                logger.info("Sending prompt chars=%d", len(llm_json["prompt"]))

        # Get a response from the API
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(f"{self.full_url}", json=llm_json, headers=self.headers)
                response.raise_for_status()
  
  
                # Pretty-print the entire response
                data = response.json()
                pretty = json.dumps(data, indent=2, ensure_ascii=False)
                print(f"\n{lu.BRIGHT_YELLOW}---------- LLM RAW RESPONSE ----------{lu.RESET}")
                print(pretty)
                print(f"{lu.BRIGHT_YELLOW}{lu.HLINE}{lu.RESET}\n")

                
                return response.json()
            
        # On timeout...
        except httpx.TimeoutException as e:
            logger.error(f"LLM call timed out after {self.timeout}s: {e}")
            return {"choices": [{"text": "The language model took too long to respond. Please try again."}]}

        # On error...
        except httpx.HTTPError as e:
            logger.error(f"LLM call failed: {e}")
            return {"error": str(e)}
        
