import os
import logging
import json
import httpx
from ...services import logging_utils as lu

logger = logging.getLogger(__name__)

import hashlib

def _truncate(s: str, n: int = 2000) -> str:
    s = "" if s is None else str(s)
    return s if len(s) <= n else (s[:n] + f"\n... [truncated {len(s)-n} chars]")

def _sha12(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()[:12]
# ================================================================================
# Wrapper class for communicating with the LLM running on the GPU VM
# ================================================================================
class LlamaAPI:
    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        timeout: float = 10.0,
        default_hyperparameters: dict | None = None,
    ):
        # Default to env vars so you can configure per environment
        self.api_key  = api_key  or os.getenv("LLM_GATEWAY_TOKEN")
        self.base_url = base_url or os.getenv("LLM_BASE_URL", "127.0.0.1")
        self.full_url = f"http://{self.base_url}:8080/v1/completions"
        self.timeout  = timeout
        self.default_hyperparameters = default_hyperparameters or {}

        # Log initialization
        logger.info(f"{lu.YELLOW}Llama API LLM initialized, base URL: {self.base_url}{lu.RESET}")
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
        prompt: str,
        max_tokens: int = 64,
        stop: list[str] | None = None,
        echo: bool = False,
        # optional hyperparameters (I might need these in future)
        temperature: float | None = None,
        top_p: float | None = None,
        top_k: int | None = None,
        repeat_penalty: float | None = None,
        presence_penalty: float | None = None,
        frequency_penalty: float | None = None,
    ):
        # Merge defaults + overrides
        hyperparameters = dict(self.default_hyperparameters)
        if temperature is not None:        hyperparameters["temperature"] = temperature
        if top_p is not None:              hyperparameters["top_p"] = top_p
        if top_k is not None:              hyperparameters["top_k"] = top_k
        if repeat_penalty is not None:     hyperparameters["repeat_penalty"] = repeat_penalty
        if presence_penalty is not None:   hyperparameters["presence_penalty"] = presence_penalty
        if frequency_penalty is not None:  hyperparameters["frequency_penalty"] = frequency_penalty

        llm_json = {
            "model": "models/Phi-3_finetuned.gguf",
            "prompt": prompt,
            "max_tokens": max_tokens,
            "stop": stop or ["<|end|>", "\n"],
            "echo": echo,
            **hyperparameters,
        }

        # ---- DEBUG: what we're sending ----
        try:
            prompt_str = llm_json.get("prompt", "")
            logger.info(
                "[LLM][REQ] model=%s max_tokens=%s stop=%s echo=%s prompt_chars=%d prompt_hash=%s",
                llm_json.get("model"),
                llm_json.get("max_tokens"),
                llm_json.get("stop"),
                llm_json.get("echo"),
                len(prompt_str),
                _sha12(prompt_str),
            )
            logger.debug("[LLM][REQ] prompt_tail:\n%s", _truncate(prompt_str[-1200:], 1200))
        except Exception as _e:
            logger.warning("[LLM][REQ] Failed to log request: %r", _e)

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
        
