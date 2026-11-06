# Reachy Mini avatar preview

Private avatar preview at `/reachy-conv-demo`. The route uses the existing login
guard and is enabled by `VITE_ENABLE_REACHY_DEMO=true` at frontend build time.
This page does not open a microphone, create a chat session, or use the robot SDK.

## Files

| File | Purpose |
|---|---|
| `ReachyDemo.tsx` | Preview controls, sample audio playback, and the Web Audio analyser |
| `ReachyAvatar.tsx` | React wrapper that loads the viewer, applies inputs, and releases resources |
| `vendor/gltf-robot.js` | Three.js model renderer, head/antenna posing, and visual neck-linkage solving |
| `vendor/motion.js` | Conversation postures, recorded emotions, and procedural dances |
| `vendor/head-wobbler.js` | Speech-reactive head movement based on the assistant audio signal |
| `vendor/*.d.ts` | TypeScript declarations for the upstream APIs used by the wrapper |
| `reachyDemo.css` | Styles scoped to this preview |
| `download-assets.mjs` | Downloads pinned upstream sources/assets and applies local adaptations |
| `UPSTREAM.txt` | Source URLs and revisions |

Model, textures, Draco decoder, and emotion JSON files are served locally from
`frontend/public/reachy-demo/`.

## Animation flow

The page passes a conversation `state` to `ReachyAvatar`, which forwards it to
`RobotMotion`. The motion layer produces a head-pose matrix, body yaw, and antenna
angles. `RobotViewer` applies these targets to the rigged model and updates the
visible neck linkages.

Supported preview states are `idle`, `listening`, `user-speaking`, `processing`
(thinking), and `ai-speaking`. These are manually selected preview states; they
do not indicate real speech recognition or model activity.

The avatar ref exposes `playEmotion(name)`, `playDance(name)`, and `stopMotion()`.
Recorded emotions load local JSON trajectories; dances use the vendored motion
implementation. Gesture audio sidecars are not downloaded.

## Sample speech

**Play sample speech plays a prerecorded WAV; it does not call TTS.** Its source
is the `<audio>` element in `ReachyDemo.tsx`, currently `/audio/sample_reply.wav`.

The audio element feeds an `AnalyserNode` connected to the speakers. Passing that
analyser as `assistantAudio` lets the head-wobbler follow the actual audio signal.
When playback ends, the page detaches the analyser input and selects `listening`.

To use a different demo voice, generate a separate WAV, place it under
`frontend/public/reachy-demo/audio/`, and update only this page's audio source.
Changing that file does not change the normal chat application's TTS voice.

## Assets and lifecycle

Run this from `frontend/` to regenerate the pinned vendor sources and assets:

```bash
node src/pages/reachy_demo/download-assets.mjs
```

The script replaces external module imports with the installed Three.js package,
uses local asset URLs, omits the companion, and adds cleanup methods. Make durable
vendor adaptations in this script: rerunning it overwrites the generated JS.

Unmounting stops animation and audio, disconnects observers/audio nodes, and
disposes scene resources. Model loading is also handled if navigation happens
before its request finishes.

This is browser animation, not physical robot simulation. Future SDK code belongs
in `backend/experimental/reachy_demo/`; live chat can later supply conversation
state and assistant audio to this wrapper.
