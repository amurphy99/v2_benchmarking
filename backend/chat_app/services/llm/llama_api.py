import os
import logging
import httpx

logger = logging.getLogger(__name__)

# ================================================================================
# Wrapper class for communicating with the LLM running on the GPU VM
# ================================================================================
class LlamaAPI:
    """
    Expected environment variables on the CPU VM:
      - LLM_BASE_URL       (e.g. "http://10.128.0.5:8080")
      - LLM_GATEWAY_TOKEN  (the same token configured in nginx on the GPU VM)
    """

    def __init__(self, base_url: str | None = None, api_key: str | None = None, timeout: float = 30.0):
        # Default to env vars so you can configure per environment
        self.base_url = base_url or os.getenv("LLM_BASE_URL", "http://127.0.0.1:8080")
        self.api_key  = api_key  or os.getenv("LLM_GATEWAY_TOKEN")
        self.timeout  = timeout

        logger.info(f"Llama API LLM initialized, URL: {self.base_url}")

        # API authorization key
        self.headers = {}
        if not self.api_key: logger.warning("LLM_GATEWAY_TOKEN (api_key) is not set - calls to nginx will be rejected (401).")
        else: self.headers["Authorization"] = f"Bearer {self.api_key}"

    # --------------------------------------------------------------------------------
    # Call the API at '/v1/completions'
    # --------------------------------------------------------------------------------
    async def __call__(self, prompt, max_tokens=64, stop=None, echo=False):
        # Prepare input (specifying which model to use)
        llm_json = {
            "model"      : "models/Phi-3_finetuned.gguf",
            "prompt"     : prompt, 
            "max_tokens" : max_tokens, 
            "stop"       : stop, 
            "echo"       : echo
        }

        # Get a response from the API
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(f"{self.base_url}/v1/completions", json=llm_json, headers=self.headers)
                response.raise_for_status()
                return response.json()

        # On error...
        except httpx.HTTPError as e:
            logger.error(f"LLM call failed: {e}")
            return {"error": str(e)}
        
