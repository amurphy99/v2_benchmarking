"""
Hand each speech result to the reply pipeline and the chat type's harness.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.consumers.processing.speech`

The STT provider calls these on the chat's event loop, in the order Google
returned the results, and a text client's `transcription` reaches `handle_final`
as well. Advancing interim/final text restarts the reply delay and invalidates
outdated automatic work through ChatHandler.note_stt_progress.
Staging final text stays with ChatHandler, scheduled right after handle_final.

"""
from __future__ import annotations
from typing     import TYPE_CHECKING

import logging
logger = logging.getLogger(__name__)

# From this project
from ....services.logging_utils import RESET, STT_MAIN
from  ...services.chatHelpers   import ChatHandler

if TYPE_CHECKING:
    from ...harnesses.base import FinalUtterance, InterimSpeech
    from  ..consumers      import ChatConsumer


# Cancel on advancing recognized text, not a repeated hypothesis, then notify the harness.
def handle_interim(consumer: ChatConsumer, speech: InterimSpeech) -> None:
    if consumer._close_scheduled: return
    if speech.new_speech and ChatHandler.note_stt_progress(consumer):
        logger.info(f"{STT_MAIN} Interim speech progress: cancelling pending response. {RESET}")
    consumer.harness.on_interim(speech)

# Let the harness hear a finished utterance, in order with the interims around it
def handle_final(consumer: ChatConsumer, utterance: FinalUtterance) -> None:
    if consumer._close_scheduled: return
    consumer.harness.on_final(utterance)
