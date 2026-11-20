# Speech System // Speech Services <br> `backend/chat_app/websocket/services/speech/..`

Contains all functionality for speech-to-text (STT) and text-to-speech (TTS) for the project. Main entry point methods are:
* **STT:** `speech.stt.speechProvider.SpeechToTextProvider` (class instantiation; reused). Google ends a stream after 305 seconds, so a stream that has run for 4 minutes hands over to a fresh one at the next quiet moment (`STT_ROTATE_AFTER_SEC`).
* **TTS:** `speech.tts.tts_streaming.synthesize_and_stream_tts` (function call; once per utterance). It speaks the response one sentence at a time, sending each sentence's audio as soon as Google returns it. Each Google call runs on a worker thread of its own (`thread_sensitive=False`), not Django's one shared thread, so no chat's database calls wait out a synthesis.

Specifically, we are currently using `Google Cloud STT v1` and `Google Cloud TTS` (NOT Gemini) for each.

<br>

TODO: 
* Could move all `.env` variables + google authorization config files into this directory


