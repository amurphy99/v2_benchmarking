# Speech System // Speech Services <br> `backend/chat_app/websocket/services/speech/..`

Contains all functionality for speech-to-text (STT) and text-to-speech (TTS) for the project. Main entry point methods are:
* **STT:** `speech.stt.speechProvider.SpeechToTextProvider` (class instantiation; reused)
* **TTS:** `speech.tts.tts_streaming.synthesize_and_stream_tts` (function call; once per utterance)

Specifically, we are currently using `Google Cloud STT v1` and `Google Cloud TTS` (NOT Gemini) for each.

<br>

TODO: 
* Could move all `.env` variables + google authorization config files into this directory


