"""
Time each reply's stages, save them with the reply, and send them to debug pages.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.services.reply_timing`

Every reply attempt is timed from the moment it starts: how long after the end
of the user's last word it started (mostly Google finishing the transcript), how
long the chat type took to work the reply out, with each model call and any hold
inside that (`services/step_timing.py`), and how long the first sentence's speech
took to synthesize. The record is saved with the reply (`ChatMessage.timing`)
and sent to the admin listeners, and to the client too when the chat is in debug
mode (`reply_timing`, `CLIENT_PROTOCOL.md`). Once the client reports that the
reply's audio started, the delay the user heard is added, and the record is
saved and sent again.

NOTE: The delay runs from the end of the user's last word to the client's report,
      both on the backend's clock. The word times count from when the audio
      reached the backend, and the report reaches it one network trip after the
      audio started, so the two one-way trips roughly cancel and the delay is
      close to the silence the user heard.

"""
from __future__  import annotations
from dataclasses import dataclass
from datetime    import datetime, timezone
from typing      import TYPE_CHECKING

import time

from channels.db import database_sync_to_async as db_s2a

# From this project
from ...services.db_services import ChatService
from   .bg_helpers           import fire_and_log

if TYPE_CHECKING:
    from ...services.step_timing import TimedStep
    from  ..consumers.consumers  import ChatConsumer

# Saved replies whose timing waits for the client to report their audio started (a reply never heard drops out)
REPLY_TIMING_KEEP = 4


# ================================================================================
# Reply Timing
# ================================================================================
# One reply attempt's timing, filled in as the attempt goes
@dataclass(slots=True)
class ReplyTiming:
    started     : float                          # When the attempt started (monotonic seconds)
    started_at  : datetime                       # ...and on the wall clock (the word timestamps' time base)
    speech_end  : datetime | None                # When the user's last word ended (None without word timings)
    features    : dict[str, bool]                # The chat type's shared features, as switched when the attempt started
    steps       : tuple[TimedStep, ...] = ()     # Model calls and holds while the reply was worked out
    generate_ms : int | None            = None   # The reply worked out (the chat type's whole `generate`)
    tts_ms      : int | None            = None   # The first sentence's speech synthesized
    delay_ms    : int | None            = None   # The user's last word ended -> the client reported the reply's audio started

    # The reply was worked out: keep the steps timed meanwhile, and how long it all took
    def generated(self, steps: list[TimedStep]) -> None:
        self.steps       = tuple(steps)
        self.generate_ms = _ms(time.monotonic() - self.started)

    # The first sentence's audio started going out this long after synthesis began
    def note_tts(self, seconds: float) -> None:
        self.tts_ms = _ms(seconds)

    # The record saved with the reply and sent in `reply_timing` (a call's `at_ms` counts from the attempt's start)
    def record(self) -> dict[str, object]:
        holds = [step.ended - step.started for step in self.steps if step.kind == "hold"]
        return {
            "stt_ms"      : None if (self.speech_end is None) else _ms((self.started_at - self.speech_end).total_seconds()),
            "generate_ms" : self.generate_ms,
            "calls"       : [{"label": step.label, "at_ms": _ms(step.started - self.started), "ms": _ms(step.ended - step.started)} for step in self.steps if step.kind == "call"],
            "hold_ms"     : _ms(sum(holds)) if holds else None,
            "tts_ms"      : self.tts_ms,
            "delay_ms"    : self.delay_ms,
            "features"    : self.features,
        }


# Start timing a reply attempt now, from the user's words (the last one's end) and the features switched on
def start_reply_timing(consumer: ChatConsumer, words: list[dict[str, object]]) -> ReplyTiming:
    return ReplyTiming(
        started    = time.monotonic(),
        started_at = datetime.now(timezone.utc),
        speech_end = max((word["end"] for word in words), default=None),
        features   = {name: feature.on for name, feature in consumer.harness.features.items()},
    )


# --------------------------------------------------------------------------------
# Sending and Saving
# --------------------------------------------------------------------------------
# The reply was saved with its timing: send it, and keep it until the client reports the reply's audio started
def track_reply_timing(consumer: ChatConsumer, response_id: int, timing: ReplyTiming) -> None:
    consumer._reply_timings[response_id] = timing
    while len(consumer._reply_timings) > REPLY_TIMING_KEEP: consumer._reply_timings.pop(next(iter(consumer._reply_timings)))
    fire_and_log(_send_reply_timing(consumer, response_id, timing.record()), name="chat::reply_timing")

# The client reported a reply's audio started: add the delay the user heard, then save and send the record again
async def finish_reply_timing(consumer: ChatConsumer, response_id: int) -> None:
    # A supplied reply was never timed, and a reply's second report finds its timing gone
    timing = consumer._reply_timings.pop(response_id, None)
    if timing is None: return

    # The delay counts only after speech (a harness turn with nothing staged has none)
    if timing.speech_end is not None: timing.delay_ms = _ms((datetime.now(timezone.utc) - timing.speech_end).total_seconds())
    record = timing.record()
    await db_s2a(ChatService.save_reply_timing)(consumer.session_id, response_id, record)
    await _send_reply_timing(consumer, response_id, record)

# Send one reply's timing to every admin listener, and to the client in debug mode
async def _send_reply_timing(consumer: ChatConsumer, response_id: int, record: dict[str, object]) -> None:
    frame = {"type": "reply_timing", "data": {"response_id": response_id, **record}}
    if consumer.debug_mode: await consumer.send_json(frame)
    await consumer._broadcast_monitor(frame)

# Seconds as whole milliseconds
def _ms(seconds: float) -> int:
    return round(seconds * 1_000)
