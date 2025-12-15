from __future__ import annotations
import logging

from typing import Any, List, Optional
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.callbacks.manager import CallbackManagerForLLMRun, AsyncCallbackManagerForLLMRun

from .llama_api import LlamaAPI

logger = logging.getLogger(__name__)


# def format_messages_to_phi_prompt(messages: List[BaseMessage]) -> str:
#     """Convert LC messages to phi-3 prompt format."""
#     parts: list[str] = []

#     for m in messages:
#         if isinstance(m, SystemMessage):
#             parts.append(f"<|system|>\n{m.content}<|end|>")
#         elif isinstance(m, HumanMessage):
#             parts.append(f"\n<|user|>\n{m.content}<|end|>")
#         elif isinstance(m, AIMessage):
#             parts.append(f"\n<|assistant|>\n{m.content}<|end|>")
#         else:
#             # fallback
#             parts.append(f"\n<|user|>\n{m.content}<|end|>")

#     parts.append("\n<|assistant|>\n")  # prompt the model to answer
#     return "".join(parts)


class CustomChatModel(BaseChatModel):
    """LangChain chat wrapper"""

    # This type annotation tells Pydantic to expect the additional attributes
    client: Any = None
    max_tokens: int = 128
    echo: bool = False

    def __init__(
        self,
        client: LlamaAPI,
        *,
        max_tokens: int = 128,
        echo: bool = False,
        **kwargs: Any,
    ):
        super().__init__(**kwargs)
        self.client = client
        self.max_tokens = max_tokens
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
        # Convert LC messages to OpenAI-style messages
        chat_messages: list[dict] = []
        for m in messages:
            role = "user"
            if isinstance(m, SystemMessage):
                role = "system"
            elif isinstance(m, AIMessage):
                role = "assistant"
            elif isinstance(m, HumanMessage):
                role = "user"
            chat_messages.append({"role": role, "content": m.content})

        logger.info("LC messages count=%d first=%s", len(messages), type(messages[0]).__name__)
        logger.info("LC messages count=%d", len(chat_messages))
        logger.info("System msg chars=%d", len(messages[0].content) if isinstance(messages[0], SystemMessage) else -1)

        resp = await self.client(
            messages=chat_messages,
            max_tokens=kwargs.get("max_tokens", self.max_tokens),
            stop=stop,  
            temperature=kwargs.get("temperature", 0.1),
            top_p=kwargs.get("top_p", 1.0),
            top_k=kwargs.get("top_k", 0),
        )

        content = resp["choices"][0]["message"]["content"]
        message = AIMessage(content=content.strip())
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
