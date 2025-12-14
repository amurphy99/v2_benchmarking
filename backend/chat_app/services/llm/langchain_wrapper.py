from __future__ import annotations

from typing import Any, List, Optional
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.callbacks.manager import CallbackManagerForLLMRun, AsyncCallbackManagerForLLMRun

from .llama_api import LlamaAPI


def format_messages_to_phi_prompt(messages: List[BaseMessage]) -> str:
    """Convert LC messages to phi-3 prompt format."""
    parts: list[str] = []

    for m in messages:
        if isinstance(m, SystemMessage):
            parts.append(f"<|system|>\n{m.content}<|end|>")
        elif isinstance(m, HumanMessage):
            parts.append(f"\n<|user|>\n{m.content}<|end|>")
        elif isinstance(m, AIMessage):
            parts.append(f"\n<|assistant|>\n{m.content}<|end|>")
        else:
            # fallback
            parts.append(f"\n<|user|>\n{m.content}<|end|>")

    parts.append("\n<|assistant|>\n")  # prompt the model to answer
    return "".join(parts)


class CustomChatModel(BaseChatModel):
    """LangChain chat wrapper"""

    # This type annotation tells Pydantic to expect the additional attributes
    client: Any = None
    max_tokens: int = 128
    stop: List[str] = ["<|end|>", "\n"]
    echo: bool = False

    def __init__(
        self,
        client: LlamaAPI,
        *,
        max_tokens: int = 128,
        stop: Optional[list[str]] = None,
        echo: bool = False,
        **kwargs: Any,
    ):
        super().__init__(**kwargs)
        self.client = client
        self.max_tokens = max_tokens
        self.stop = stop or ["<|end|>", "\n"]
        self.echo = echo

    @property
    def _llm_type(self) -> str:
        return "custom_langchain_wrapper"

    async def _agenerate(
        self,
        messages: List[BaseMessage],
        stop: Optional[List[str]] = None,
        run_manager: Optional[AsyncCallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> ChatResult:
        prompt = format_messages_to_phi_prompt(messages)

        resp = await self.client(
            prompt=prompt,
            max_tokens=kwargs.get("max_tokens", self.max_tokens),
            stop=stop or self.stop,
            echo=kwargs.get("echo", self.echo),
        )

        raw_text = resp["choices"][0]["text"]

        # If echo=True, strip everything before last assistant tag
        completion = raw_text.split("<|assistant|>")[-1].strip()

        message = AIMessage(content=completion)
        return ChatResult(generations=[ChatGeneration(message=message)])

    # handler for if we ever call sync methods by mistake
    def _generate(
        self,
        messages: List[BaseMessage],
        stop: Optional[List[str]] = None,
        run_manager: Optional[CallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> ChatResult:
        raise RuntimeError("Use async: await chat_model.ainvoke(...) / .agenerate(...)")
