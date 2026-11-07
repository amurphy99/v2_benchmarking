# Reachy Mini activity-chat demo

Private browser demo at `/reachy-conv-demo`. The route uses the existing login
guard, has no main-site navigation entry, and is enabled by
`VITE_ENABLE_REACHY_DEMO=true` at frontend build time.

Starting a conversation opens the microphone and the existing activity-chat
WebSocket. It uses the logged-in account, backend speech recognition, the default
backend Google TTS voice, and normal session/message persistence. Use a test
account. Audio recording follows the backend's existing configuration.

## Files

| File | Purpose |
|---|---|
| `ReachyDemo.tsx` | Live chat controls, transcript, and avatar inputs |
| `useReachyChat.ts` | Existing activity WebSocket protocol, microphone capture, streamed audio playback, and cleanup |
| `expressionPolicy.ts` | Replaceable text-to-gesture heuristic and server/admin gesture handling |
| `ReachyAvatar.tsx` | React wrapper that loads the viewer, applies inputs, and releases resources |
| `ReachyPreviewPanel.tsx` (optional extension) | Manual motion/posture controls and local sample audio |
| `vendor/gltf-robot.js` | Three.js model renderer, head/antenna posing, and visual neck-linkage solving |
| `vendor/motion.js` | Conversation postures, recorded emotions, and procedural dances |
| `vendor/head-wobbler.js` | Speech-reactive head movement based on the assistant audio signal |
| `vendor/*.d.ts` | TypeScript declarations for the upstream APIs used by the wrapper |
| `reachyDemo.css` | Styles scoped to this demo |
| `download-assets.mjs` | Downloads pinned upstream sources/assets and applies local adaptations |
| `UPSTREAM.txt` | Source URLs and revisions |

Model, textures, Draco decoder, and emotion JSON files are served locally from
`frontend/public/reachy-demo/`.

## Conversation flow

`useReachyChat` opens `/ws/chat/activity/` with the existing access token and
`source=webapp`. This reaches the normal `ChatConsumer` and activity harness; no
Reachy-specific backend consumer or voice override is required.

The microphone uses `AudioStreamer` to send 16 kHz mono signed 16-bit PCM.
`user_utt` updates the user transcript, `llm_response` adds the assistant reply,
and `audio_chunk` is scheduled by the shared `useAudioPlayer` hook. React renders
transcript text directly, without interpreting it as HTML.

The player reports `tts_playback` start/finish events using each persisted
`responseId`. A small optional `onAudioSource` callback in the shared player
connects those same audio sources to a demo analyser. The shared player still
routes sound to the speakers; the demo analyser's output is unconnected, so it
does not play a second copy.

`cancel_audio` clears buffered playback and gesture state. Backend recognition
pause/resume events control the microphone while allowing TTS acknowledgements
to play. On `chat_ended`, the microphone stops and buffered goodbye audio drains
before the audio player is released. The End conversation button stops immediately.

Each new primary chat connection can replace another connection for the same
account. Do not run a normal chat tab or a second primary robot client alongside
this demo using the same account.

This page tests the activity pipeline currently implemented. Persistent
cross-session participant memories remain planned work in
[`ACTIVITY_PIPELINE_REFACTOR_PLAN.md`](../../../../backend/chat_app/websocket/agents/ACTIVITY_PIPELINE_REFACTOR_PLAN.md).

## Animation and behavior

The page passes a conversation `state` to `ReachyAvatar`, which forwards it to
`RobotMotion`. The motion layer produces a head-pose matrix, body yaw, and antenna
angles. `RobotViewer` applies these targets to the rigged model and updates the
visible neck linkages.

Supported avatar states are `idle`, `listening`, `user-speaking`, `processing`
(thinking), and `ai-speaking`. Live chat currently supplies idle, listening,
processing, and speaking states. The preview extension can also select the
user-speaking posture; the live hook does not expose interim user voice activity.

Passing the assistant analyser to the avatar lets the head-wobbler follow the
actual speech signal. `expressionPolicy.ts` additionally selects a recorded
gesture from simple reply-text rules, beginning when that reply's audio starts.
It is a heuristic, not a trained emotion classifier.

Automatic text-based gestures have an eight-second cooldown and a 1.2-second
playback limit. Primary emotions/dances override speech sway in the current
renderer rather than blending with it. Short accents return control to the
speech-driven movement. The policy skips automatic text gestures when reduced
motion is requested, and explicit server/admin gestures take priority.

The avatar ref exposes `playEmotion(name)`, `playDance(name)`, and `stopMotion()`.
Recorded emotions load local JSON trajectories; dances use the vendored motion
implementation. Gesture audio sidecars are not downloaded.

## Optional side-panel preview

The optional `ReachyPreviewPanel.tsx` extension restores manual previews beside
the conversation view. Install it together with its page/CSS wiring, downloader
catalog adaptation, and vendor TypeScript declarations.

Its motion dropdown groups recorded emotion IDs separately from procedural
dances. The adapted downloader exports `RECORDED_EMOTIONS` from the pinned
dataset file list; dance names come directly from the vendor's `DANCES` export.
It also registers all recorded IDs with the resolver, preserving exact filenames
including hyphens, so selecting a clip does not silently play a random fallback.

Mount manual controls only while the chat is idle or ended. Starting a chat
unmounts the panel, stops its motion/audio, and gives control back to live chat.
The sidebar stacks beneath the conversation on smaller screens.

**Play sample speech uses the existing `/audio/sample_reply.wav`; it does not
call TTS.** Its separate Web Audio graph drives the same avatar analyser input.
Sample playback, posture selection, Stop preview, and Reset do not create a chat
session or open the microphone. Live chat continues to use the backend's default
voice.

## Assets and lifecycle

Run this from `frontend/` to regenerate the pinned vendor sources and assets:

```bash
node src/pages/reachy_demo/download-assets.mjs
```

The script replaces external module imports with the installed Three.js package,
uses local asset URLs, omits the companion, and adds cleanup methods. Make durable
vendor adaptations in this script: rerunning it overwrites the generated JS.

Generated public assets are excluded from Git. Downloads use a cache keyed by
the pinned source URL, under `frontend/.cache/reachy-downloads` locally or
`REACHY_ASSET_CACHE_DIR` when configured. Deployment prepares assets before the
frontend image is built, using `utils/prepare_reachy_demo.sh` in the deployment
repository. `ENABLE_REACHY_DEMO=true` enables preparation and the frontend build
flag; the deployment helper restricts this to the sandbox.

After installing the optional catalog adaptation, regenerate assets before
building so `vendor/motion.js` includes `RECORDED_EMOTIONS`.

Unmounting closes the chat socket, stops microphone/audio/animation, disconnects
observers/audio nodes, and disposes scene resources. Pending microphone requests
and model loading are also handled if navigation happens before they finish.

## Independent Python controller

This is browser animation, not a Reachy SDK daemon or a physics simulator.
Arbitrary Python robot apps cannot control this renderer without a pose bridge.
The official MuJoCo simulator is the existing route for testing SDK applications
without a physical robot.
