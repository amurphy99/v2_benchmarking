"""
Tests for sentence-by-sentence TTS streaming to the frontend.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.tests.test_tts_streaming`

The web app plays each `audio_chunk` as it arrives and reports playback for the
response's `responseId`. It relies on a sentence's audio being sent before the
next sentence is synthesized, on `sequence` running across the whole response,
and on exactly one chunk (the final one sent) carrying `last`.

"""
import json, unittest

from unittest.mock import patch

# From this project
from chat_app.websocket.services.speech.tts import tts_streaming

# Fake synthesis length: two and a half chunks of audio for every piece of text
TEST_PIECE_BYTES = (5 * tts_streaming.CHUNK_SIZE) // 2


# Stand-in for Google TTS that logs each request, and returns no audio for text containing "FAIL"
class FakeTextToSpeech:
    def __init__(self, events: list[str]) -> None:
        self.events = events

    # Log the request, then return silent PCM (or nothing, like a failed synthesis)
    def synthesize_speech(self, text: str) -> tuple[bytes, int, int, int]:
        self.events.append(f"synthesize: {text}")
        if "FAIL" in text: return b"", 24_000, 1, 16
        return bytes(TEST_PIECE_BYTES), 24_000, 1, 16


# ================================================================================
# Sentence Streaming Tests
# ================================================================================
class SentenceStreamingTests(unittest.IsolatedAsyncioTestCase):
    """
    Speak a response through the fake synthesizer and record every frame sent.
    """
    # Speak one response, returning the request/send log and the chunks the frontend received
    async def speak(self, text: str) -> tuple[list[str], list[dict[str, object]]]:
        events : list[str]               = []
        chunks : list[dict[str, object]] = []

        # Frontend socket stand-in
        async def send(frame: str) -> None:
            data = json.loads(frame)["data"]
            events.append(f"send: {data['sequence']}")
            chunks.append(data)

        with patch.object(tts_streaming, "TextToSpeechProvider", lambda: FakeTextToSpeech(events)):
            await tts_streaming.synthesize_and_stream_tts(text, send, response_id=7)
        return events, chunks

    # Send each sentence's audio before synthesizing the next one (only its newest chunk waits)
    async def test_audio_goes_out_before_the_next_sentence_is_synthesized(self) -> None:
        events, _ = await self.speak("That sounds really lovely to me! What kinds of flowers do you grow?")
        self.assertEqual(events, [
            "synthesize: That sounds really lovely to me!",
            "send: 0", "send: 1",
            "synthesize: What kinds of flowers do you grow?",
            "send: 2", "send: 3", "send: 4",
            "send: 5",
        ])

    # Number chunks across the whole response and mark only the final one `last`
    async def test_sequence_spans_the_response_and_only_the_final_chunk_is_last(self) -> None:
        _, chunks = await self.speak("That sounds really lovely to me! What kinds of flowers do you grow?")
        self.assertEqual([c["sequence"] for c in chunks], list(range(6)))
        self.assertEqual([c["last"] for c in chunks], [False] * 5 + [True])
        self.assertTrue(all(c["responseId"] == 7 for c in chunks))

    # Still end the response with a `last` chunk when its final sentence fails to synthesize
    async def test_a_failed_final_sentence_still_ends_the_response(self) -> None:
        _, chunks = await self.speak("That sounds really lovely to me! FAIL on this whole sentence, please.")
        self.assertEqual([c["last"] for c in chunks], [False, False, True])

    # Join short sentences (and abbreviations) to the next piece instead of synthesizing them alone
    async def test_short_sentences_join_the_next_piece(self) -> None:
        events, _ = await self.speak("Oh. Dr. Lee told me that sounds lovely! Do you grow tomatoes too?")
        spoken = [e.removeprefix("synthesize: ") for e in events if e.startswith("synthesize: ")]
        self.assertEqual(spoken, ["Oh. Dr. Lee told me that sounds lovely!", "Do you grow tomatoes too?"])
