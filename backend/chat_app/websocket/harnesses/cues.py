"""
Shared cues: react to words in the user's speech, or to the user's silence.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.cues`

Building blocks a chat type subclasses for its own cues. `KeywordCue` fires once
for each new occurrence of a pattern while the user speaks, and `SilenceWatcher`
times the user's silence on their turn. Each subclass decides what the avatar
does when it fires.

"""
from __future__  import annotations
from abc         import abstractmethod
from collections import Counter
from typing      import Literal

import asyncio, re, time

# From this project
from .base import ChatHarness, Cue, FinalUtterance, InterimSpeech, ResponseOutcome, TurnAttempt


# --------------------------------------------------------------------------------
# Keyword Cue
# --------------------------------------------------------------------------------
# React the moment a word or phrase is heard, once for each time it is said
class KeywordCue(Cue):
    """
    Each interim repeats the whole utterance so far, and later interims revise it,
    so a plain search would fire again on every interim after the word appears. This
    counts each pattern's occurrences in the current utterance and fires `on_match`
    only for new ones; a revision that drops a word and brings it back does not fire
    it twice. A final is checked as well (its last word may never have reached an
    interim), and then the count starts over for the next utterance.

    With `ON = "final"`, only finals are checked: later, but never on a misheard interim.
    """
    PATTERNS : dict[str, re.Pattern[str]]  = {}         # Match name -> compiled pattern
    ON       : Literal["interim", "final"] = "interim"  # The earliest result to react to

    # Start with nothing counted
    def __init__(self, harness: ChatHarness) -> None:
        super().__init__(harness)
        self._fired : Counter[str] = Counter()  # Occurrences already fired per name, in the current utterance

    # React to one new occurrence (the subclass decides what the avatar does)
    @abstractmethod
    def on_match(self, name: str, text: str) -> None: ...

    # Check the utterance so far while the user is still speaking
    def on_interim(self, speech: InterimSpeech) -> None:
        if self.ON == "interim": self._check(speech.text)

    # Check the finished utterance, then start counting the next one
    def on_final(self, utterance: FinalUtterance) -> None:
        self._check(utterance.text)
        self._fired.clear()

    # Fire once for each occurrence beyond those already fired (a revision never lowers the count)
    def _check(self, text: str) -> None:
        for name, pattern in self.PATTERNS.items():
            found = len(pattern.findall(text))
            for _ in range(self._fired[name], found): self.on_match(name, text)
            self._fired[name] = max(self._fired[name], found)


# ================================================================================
# Silence Watcher
# ================================================================================
# React once the user has been silent this long on their turn
class SilenceWatcher(Cue):
    """
    Calls `on_silence(seconds)` as each of `THRESHOLDS_SEC` passes without speech.
    The clock starts when the client reports that the avatar's reply finished
    playing, and restarts from the end of any newer speech. It stops while a reply
    is being prepared or played, and nothing fires while listening is paused.

    The clock runs again after every reply, so a cue that speaks from `on_silence`
    (a re-prompt) counts its own turns to avoid prompting forever.

    NOTE: Only clients that send `tts_playback` (the web app) start the clock after
          a reply. The web app never reports "finished" for a reply whose audio was
          cancelled, so after a cancelled reply the user's next speech starts it.
    """
    THRESHOLDS_SEC : tuple[float, ...] = ()  # Seconds of silence at which `on_silence` runs, in order

    # Start with the clock stopped
    def __init__(self, harness: ChatHarness) -> None:
        super().__init__(harness)
        self._timers    = []     # Thresholds still waiting to fire (`asyncio.TimerHandle`s)
        self._preparing = False  # A reply attempt is running
        self._playing   = False  # A reply's audio is playing
        self._stopped   = False  # The connection is closing

    # React to the user's silence (the subclass decides what the avatar does)
    @abstractmethod
    def on_silence(self, seconds: float) -> None: ...

    # Newer speech restarts the clock from where that speech ended
    def on_interim(self, speech: InterimSpeech) -> None:
        if speech.new_speech: self._restart(speech.ended_at.timestamp())

    # A finished utterance restarts it from its last word (from now, for a text client)
    def on_final(self, utterance: FinalUtterance) -> None:
        if utterance.words: self._restart(utterance.words[-1]["end"].timestamp())
        else:               self._restart(time.time())

    # The avatar is preparing to speak: this isn't the user's silence
    def on_reply_started(self, attempt: TurnAttempt) -> None:
        self._preparing = True
        self._clear()

    # Its text went out; the clock waits for its audio to finish
    def on_reply_saved(self, outcome: ResponseOutcome) -> None:
        self._preparing = False

    # A cancelled reply: a saved one's audio was cut short, so it will never report "finished"
    def on_reply_cancelled(self, attempt: TurnAttempt, saved: bool) -> None:
        self._preparing = False
        if saved: self._playing = False

    # The clock runs only once the reply's audio has finished
    def on_playback(self, response_id: int, state: str) -> None:
        self._playing = (state == "started")
        if self._playing: self._clear()
        else:             self._restart(time.time())

    # Nothing may fire once the connection is closing
    def stop(self) -> None:
        self._stopped = True
        self._clear()

    # Schedule every threshold from the moment the silence began (epoch seconds)
    def _restart(self, silent_since: float) -> None:
        self._clear()
        if self._stopped or self._preparing or self._playing: return

        loop  = asyncio.get_running_loop()
        start = loop.time() - (time.time() - silent_since)  # The same moment on the loop's clock
        self._timers = [loop.call_at(start + seconds, self._fire, seconds) for seconds in self.THRESHOLDS_SEC]

    # Report one threshold, unless listening is paused
    def _fire(self, seconds: float) -> None:
        if self.harness.consumer.streaming_active: self.on_silence(seconds)

    # Cancel any thresholds still waiting
    def _clear(self) -> None:
        for timer in self._timers: timer.cancel()
        self._timers = []
