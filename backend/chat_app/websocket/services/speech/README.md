# Speech System // Speech Services <br> `backend/chat_app/websocket/services/speech/..`

Contains all functionality for speech-to-text (STT) and text-to-speech (TTS) for the project. Main entry point methods are:
* **STT:** `speech.stt.speechProvider.SpeechToTextProvider` (class instantiation; reused)
* **TTS:** `speech.tts.tts_streaming.synthesize_and_stream_tts` (function call; once per utterance). It speaks the response one sentence at a time, sending each sentence's audio as soon as Google returns it.

Specifically, we are currently using `Google Cloud STT v1` and `Google Cloud TTS` (NOT Gemini) for each.

## Shared turn-taking

Valid microphone PCM from every source is routed to backend STT, including QT.
The legacy `use_backend_STT` flag controls finalized transcript echoing;
it does not enable or disable transcription. `use_backend_TTS` controls actual
backend synthesis. QT/Buddy normally speak returned text onboard; `webapp` and
`reachyrobot` receive the existing default backend voice.

The provider forwards interim and final transcripts without requesting separate
VAD events. `ChatHandler.note_stt_progress()` restarts the reply timer and cancels
outdated automatic work when recognized text advances. A finalized transcript is
still required before generation. The configured delay is an additional wait
after the latest recognized-text progress, including the final result; it does not
configure Google's endpointer or measure acoustic silence. Zero adds no application
wait, but recognition and model/network latency remain.

`set_reply_delay` changes a finite 0–5 second connection setting for any source.
The primary client reads its applied value from `command_ack.state.reply_delay_seconds`.
Explicit `reply_now` flushes accepted audio through its existing barrier and bypasses
the automatic wait. Pause/resume commands are not delayed.

TTS chunks identify the saved assistant reply with `responseId`. Synthesis ending
does not mean the client has finished playback. Optional `tts_playback` reports
(`started`, `finished`, `interrupted`) track delivery; targeted `cancel_audio`
stops eligible buffered speech. Harness interruption context retains the generated
text, without claiming an exact heard-word boundary.

See [the client protocol](../../consumers/CLIENT_PROTOCOL.md) for wire formats.

<br>

TODO: 
* Could move all `.env` variables + google authorization config files into this directory


