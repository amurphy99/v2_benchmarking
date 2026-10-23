"""
Text-to-speech (TTS) synthesized audio streaming.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.services.speech.tts.tts_streaming`

We use TTS to synthesize audio for the assistant messages here, and then we
stream it to the frontend for playback to the user. Each response is spoken one
sentence at a time: a sentence's audio goes out as soon as Google returns it,
and the next sentence is synthesized while the frontend plays it, so playback
starts after the first sentence instead of after the whole response.

NOTE: Not all of our "frontend" interfaces use this -- some just need to get the
      assistant's text response back from us and they will handle TTS on their
      own (QT Robot, Buddy Robot).

TODO: Synthesis is per sentence rather than truly streamed: each sentence still
      waits for Google's full result before any of its audio is sent. Google's
      streaming synthesis would start the audio after the first few words, but
      it only supports Chirp 3 HD voices (the current voice is Chirp HD).

------

NOTE: Additionally, we used to attempt to combine the actual raw TTS output that
      was generated for the assistant's messages here and merge it into the
      audio that we track and save for the user's session. There were multiple
      issues with that including formatting, correctly aligning the timestamps,
      and more, so that function has been cut.

"""
import asyncio, base64, json, logging, re
logger = logging.getLogger(__name__)

from asgiref.sync import sync_to_async
from time         import monotonic as now_ts
from typing       import Awaitable, Callable

# From this project
from .....services               import logging_utils as lu
from .....services.logging_utils import RESET, BOLD, UNBOLD, TTS_MAIN
from     .tts_google             import TextToSpeechProvider

# Chunk size (bytes) of TTS audio streamed back to frontend client.
CHUNK_SIZE = 8_192  # Maximum PCM bytes included in one outbound TTS WebSocket chunk

# Where a response splits into sentences: after ., !, or ? (and any closing quote or bracket), or at a line break
TTS_SENTENCE_BREAK = re.compile(r"(?<=[.!?])\s+|(?<=[.!?][\"'”’)\]])\s+|\s*\n\s*")

# Shortest text synthesized on its own (a shorter sentence joins the next, which keeps "Dr." or "Oh." attached)
TTS_MIN_PIECE_CHARS = 24

# Active frontend WebSocket sender
SendCallback = Callable[[str], Awaitable[object]]


# ================================================================================
# Stream a TTS audio response to the frontend in base64 chunks
# ================================================================================
async def synthesize_and_stream_tts(system_resp: str, send_callback: SendCallback, response_id: int) -> None:
    """
    1) Split the response into sentences (short ones join the next)
    2) Synthesize each one (run sync TTS off the event loop) and send its audio as
       soon as it is ready, with format and response metadata

    NOTE: We include the `response_id` here when we send the data to the frontend
          so that they have the option to respond with control messages letting
          us know when they actually start and finish with audio playback. This
          let's us recover utterance-level start and end timestamps that we
          could not otherwise track.
    """
    t0       = now_ts()
    pieces   = _speech_pieces(system_resp)
    sender   = _AudioChunkSender(send_callback, response_id)
    first_at = 0.0

    # Synthesize and send one piece at a time
    # NOTE: This is a synchronous network call, so we run it in a thread
    tts_provider = TextToSpeechProvider()
    for index, piece in enumerate(pieces):
        audio_bytes, sr, ch, bps = await sync_to_async(tts_provider.synthesize_speech)(piece)
        await sender.add(audio_bytes, sr, ch, bps)
        if index == 0: first_at = now_ts() - t0

    # The response's final chunk goes out last, marked as such
    await sender.finish()

    # Log upon completion
    total_time = now_ts() - t0
    logger.info(f"{TTS_MAIN} Synthesized speech sent to frontend in {len(pieces)} piece(s) (first after {lu.CYAN}{BOLD}{first_at:.4f}s{UNBOLD}{TTS_MAIN}, all after {lu.CYAN}{BOLD}{total_time:.4f}s{UNBOLD}{TTS_MAIN}). {RESET}")


# --------------------------------------------------------------------------------
# Sentence Pieces
# --------------------------------------------------------------------------------
# Split a response into the pieces synthesized one at a time (a too-short sentence joins the next)
def _speech_pieces(text: str) -> list[str]:
    pieces : list[str] = []
    pending = ""
    for sentence in TTS_SENTENCE_BREAK.split(text.strip()):
        pending = f"{pending} {sentence}".strip()
        if len(pending) >= TTS_MIN_PIECE_CHARS: pieces.append(pending); pending = ""

    # A short tail joins the last piece (or stands alone when it is the whole response)
    if pending and pieces: pieces[-1] = f"{pieces[-1]} {pending}"
    elif pending:          pieces.append(pending)
    return pieces


# --------------------------------------------------------------------------------
# Numbered Audio Chunks
# --------------------------------------------------------------------------------
# Send one response's audio as numbered chunks, holding back the newest chunk until more audio follows it
class _AudioChunkSender:
    """
    The held chunk goes out as soon as more audio arrives, or marked `last` when the
    response ends, so the final chunk the frontend receives always carries `last`,
    even when a later sentence fails to synthesize (it comes back with no audio).
    `sequence` runs across the whole response.

    NOTE: The synthesizer returns (pcm_bytes, sample_rate, num_channels,
          bits_per_sample) so the audio recorder can resample both channels with
          proper WAV parameters instead of guessing. This should help prevent
          the static we hear in the playback (the user sends us audio in a
          different format than TTS generates it in; we can't just combine them
          blindly).
    """
    def __init__(self, send_callback: SendCallback, response_id: int) -> None:
        self.send_callback = send_callback
        self.response_id   = response_id
        self.sequence      = 0                                          # Number the next chunk sent gets
        self.held          : tuple[bytes, int, int, int] | None = None  # Newest unsent chunk and its PCM format

    # Send everything but the newest chunk of one sentence's audio
    async def add(self, audio_bytes: bytes, sample_rate: int, channels: int, bits_per_sample: int) -> None:
        for start in range(0, len(audio_bytes), CHUNK_SIZE):
            if self.held is not None: await self._send(self.held, last=False)
            self.held = (audio_bytes[start:start + CHUNK_SIZE], sample_rate, channels, bits_per_sample)

    # Send the held chunk as the response's last one
    async def finish(self) -> None:
        if self.held is not None: await self._send(self.held, last=True)
        self.held = None

    # Send one chunk with everything the browser needs to schedule and identify this response
    async def _send(self, held: tuple[bytes, int, int, int], *, last: bool) -> None:
        chunk, sample_rate, channels, bits_per_sample = held
        payload = {
            "type": "audio_chunk",
            "data": {
                "b64"           : base64.b64encode(chunk).decode("utf-8"),
                "responseId"    : self.response_id,
                "sampleRate"    : sample_rate,
                "channels"      : channels,
                "bitsPerSample" : bits_per_sample,
                "sequence"      : self.sequence,
                "last"          : last,
            }
        }
        self.sequence += 1
        await self.send_callback(json.dumps(payload))
