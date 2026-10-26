# Frontend // Smiley Avatar <br> `frontend/src/pages/common/avatar/smiley/..`

The Smiley is a code-drawn, iOS-emoji-style face: an SVG that redraws every
animation frame. It is one of the web app's avatars (`avatarRegistry.tsx` lists
it twice: `smiley`, and `smiley-brows`, which always shows its eyebrows) and
shows up in three places:

* **The chat page** (`pages/chat/`): it dozes while the chat is stopped, looks
  like it's listening, thinking, or speaking, and moves its mouth with the
  reply's audio.
* **The admin Live Chat panel** (`pages/admin/`): an admin can send it any of
  its named actions.
* **The public avatar demo** (`/avatar-demo`): every behavior, with no backend.

The code is split so that **behavior** (what the face is doing over time) and
**drawing** (turning one frame's numbers into SVG) never mix. The controller
produces one `FaceState` per frame, and the 2D renderer only draws it, so a
different renderer (say, 3D) could replace `render_2d/` without touching the
rest.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- File Layout                                                                      -->
<!-- -------------------------------------------------------------------------------- -->
# File Layout
```diff
 smiley/
 ├── SmileyAvatar.tsx          # Entry component: exposes the controller as the avatar handle, draws its face
 ├── useFaceController.ts      # The frame loop: combines every layer into one FaceState each frame, plus the handle
 │
 ├── state/
 │   └── faceState.ts          # FaceState (every number the renderer draws), the base face, blending two faces
 │
 ├── actions/                  # The public action names, in three categories
 │   ├── smileyActions.ts      # The categories, the moods, and the lookup that plays an incoming name
 │   ├── faceExpressions.ts    # Expressions: named faces (one line each)
 │   ├── faceMotions.ts        # Movements: named head/eye motions, plus the shared offset and easing helpers
 │   └── faceAnimations.ts     # Animations: a face combined with movement and/or breath
 │
 ├── behavior/                 # Things the avatar does on its own
 │   ├── passiveMotions.ts     # Passive motions on channels (listening sway, head cock; breathing's channel)
 │   └── breathing.ts          # Breathing rhythm, deliberate breaths (yawn), and the breath before speaking
 │
 ├── objects/
 │   └── faceObjects.ts        # Objects (hands, hearts): face spots, placement, blending, animation offsets
 │
 └── render_2d/                # The SVG renderer (pure: draws whatever FaceState it is given)
     ├── SmileyFace2D.tsx      # The whole face: gradients, head, features, objects, ground shadow
     ├── SmileyEye2D.tsx       # One eye and its brow (open, closed arcs, spirals, hearts)
     ├── SmileyMouth2D.tsx     # The mouth: closed line, or opening with teeth and tongue
     ├── SmileyExtras2D.tsx    # The tear and the sleep Zs
     ├── SmileyHand2D.tsx      # One hand object
     ├── SmileyHeart2D.tsx     # One floating heart object
     ├── faceDrawing2D.ts      # Face layout and shape math (eyes, brows, mouth, extras)
     └── objectDrawing2D.ts    # Object shapes (hands, heart, tear), placement, and lighting
```

Outside this folder:

| File | What it does for the Smiley |
|---|---|
| `../avatarRegistry.tsx` | The avatar contract (`AvatarHandle`, `RobotAction`) and the registry entries |
| `../useSpeakingAvatar.ts` | Turns the audio player's loudness into mouth movement and speech phases |
| `pages/chat/useChatAvatar.ts` | Drives the avatar on the chat page (sleep, conversation state, mouth) |
| `pages/avatar_demo/` | The demo page and its controls |
| `pages/admin/capabilities/profiles.ts` | Builds the Smiley's admin/demo buttons from `SMILEY_ACTION_SECTIONS` |
| `pages/admin/FRONTEND_CAPABILITIES.md` | How every frontend's buttons and action names work |
| `frontend/src/index.css` | The `no-transition` class the SVG needs (see [Gotchas](#gotchas)) |

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- How a Frame Is Made                                                              -->
<!-- -------------------------------------------------------------------------------- -->
# How a Frame Is Made

1. **The page talks to the handle.** Pages hold a `ref` to the avatar and call
   `AvatarHandle` methods: `performAction` (a backend `robot_action` or an admin
   button) and the optional ones (`setConversationState`, `setSpeechLevel`,
   `sleep` / `wake`, `prepareToSpeak`, …). The handle methods only write refs,
   so calling them often is cheap.
2. **The frame loop builds the face** (`useFaceController.ts`), in layers:
   1. **Expression:** the face showing now, easing into a new one (180 ms),
      holding for the action's `duration_ms`, then easing back to the resting
      face. A timed animation's face shows on top of it, by an amount over time.
   2. **Offsets:** the movement or timed animation playing (one at a time),
      plus the passive motions: a sway or head cock while listening (never
      during a movement or animation) and breathing (always).
   3. **Gaze**, by priority: a point the page set → the speech phase's look →
      the conversation state's look → small idle glances around the user.
   4. **Wander:** a slow drift for faces that set `wander` (Ponder).
   5. **Blinks**, at random gaps.
   6. **Listening look and mouth:** slightly bigger eyes while listening, and the
      voice level the page reports.
   7. **Combine** into one `FaceState`, including the objects (with any
      animation offsets applied).
3. **The renderer draws it** (`render_2d/SmileyFace2D.tsx`). Anything animated
   in the drawing (the tear's drip, the Zs, a heart's bob) is worked out from the
   face's clocks (`timeSec`, `expressionSec`), so drawing stays a pure function.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- The Face Model                                                                   -->
<!-- -------------------------------------------------------------------------------- -->
# The Face Model

`FaceState` (`state/faceState.ts`) is every number the renderer needs: where
the eyes and head point, eye shape and style, brows, mouth shape, extras (tear,
frost, Zs, …), color, size and position. Every field is a number (or an RGB
color), so **any two faces can blend**: an expression change is just a blend
from one face to another. Styles like closed-eye arcs or spiral eyes are
crossfade amounts for the same reason.

The one exception is `objects` (hands and hearts), which has its own blending
rules (see [Objects](#objects)).

Every named face is written as **changes to the base face** (`FaceChanges`):
only the fields that differ, plus an optional `objects` list. `fullFace()`
turns that into a complete `FaceState`.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Public Actions                                                                   -->
<!-- -------------------------------------------------------------------------------- -->
# Public Actions

Every name in these three categories is part of the Smiley's public API: the
backend and the admin panel send them by name.

| Category | What it is | Where | Examples | Sent as |
|---|---|---|---|---|
| Expressions | A face that changes the face's shapes, held for `duration_ms` | `actions/faceExpressions.ts` | `Grinning Face`, `Cold Face` | `emotion` |
| Movements | A head/eye motion that leaves the face alone, at its own length | `actions/faceMotions.ts` | `Nod`, `Head Tilt` | `animation` |
| Animations | A face combined with movement or breath | `actions/faceAnimations.ts` | `Ponder` (held), `Yawn` (timed) | `animation` |

* **Lookup** (`resolveSmileyAction` in `actions/smileyActions.ts`): an incoming
  action is matched by **name**, case-insensitively, in any category; its
  `kind` is ignored. An unknown name returns to the resting face.
* **Moods** (the LLM's labels, like `Happy` or `Tired`, in `smileyActions.ts`)
  each pick a random name from a short list, which can mix expressions and
  animations.
* **Rules for names:** unique across the three categories, and never the same
  as a mood (a `Thinking` animation would be read as the `Thinking` mood).
  Expressions are named after the iOS emoji they borrow from; animations and
  movements are verbs.
* **Adding one:** an expression or movement is one table entry; an animation is
  one entry (held: just a face; timed: a length, a face amount over time, a
  motion, and an optional breath). Buttons appear automatically.
* **The protocol is unchanged:** `robot_action` still carries `emotion` /
  `animation` (`backend/chat_app/websocket/consumers/CLIENT_PROTOCOL.md` §3.1).

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Objects                                                                          -->
<!-- -------------------------------------------------------------------------------- -->
# Objects

Objects are things drawn on or around the face that aren't its own features:
**hands** and **floating hearts** today. (The tear and the Zs are still extras;
heart eyes are an eye style that borrows the heart shape.)

A face places its objects in its `objects` list:

```ts
objects: [{kind: "hand", side: "left", shape: "pointing", at: "chin", dx: -34, angle: -15}]
objects: [{kind: "heart", at: "center", dx: -96, dy: -50, scale: 1, bob: 4, pulse: 0.12}]
```

* **Spots** (`at`): `center`, `mouth`, `chin`, `eyeLeft` / `eyeRight`,
  `cheekLeft` / `cheekRight` (`SMILEY_FACE_SPOTS` in `objects/faceObjects.ts`).
  `dx` / `dy` are face units from the spot, `angle` is degrees, and `scale`
  multiplies the kind's size.
* **Hands:** one per screen side (`left`, `right`). Shapes are drawn as left
  hands and mirrored for the right one; positions are plain screen directions.
  Shapes: `raised` (✋) and `pointing` (☝️), in `render_2d/objectDrawing2D.ts`.
* **Hearts:** each heart is its own object, with its own size, bob, pulse, and
  optional `phase` (left out, a face's hearts are spread evenly through the bob).
* **Keys and blending:** hands are keyed `hand-left` / `hand-right`, hearts
  `heart-1`, `heart-2`, … in order. Between two faces, the same key and shape
  slides to its new spot; anything else fades out or in where it is. A hand
  fading in rises into place; a heart grows in.
* **Animations can move objects** by key (`MotionOffsets.objects`), and
  `mirrored()` sends a left hand's offsets to the right hand.
* **Lighting:** objects are lit from the top of the head, like the face's own
  shading, at the object's own angle (`shadeLine`), and a hand's shadow falls
  down the head.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Behaviors                                                                        -->
<!-- -------------------------------------------------------------------------------- -->
# Behaviors

* **Movements** play one at a time; a new one replaces the one playing. One
  that favors a side is written once and listed again through `mirrored()`.
* **Timed animations** (Yawn, Glance Up) run their own length: their face
  shows by an amount over time while the face underneath settles to rest, so
  they always end on the resting face. Held animations (Ponder) act like an
  expression.
* **Passive motions** (`behavior/passiveMotions.ts`) play on channels.
  *Episodic* channels (`head`: the listening sway and head cock) take turns,
  rest a random gap, and pause for movements and animations. *Continuous*
  channels (`breath`) always play. Different channels always overlap.
* **Breathing** (`behavior/breathing.ts`): a steady rhythm (slower and deeper
  while asleep) that a deliberate breath can take over. The Yawn takes one, and
  so does `prepareToSpeak(inMs?)`: a breath in that tops out just before the
  reply is heard and lets go once the conversation state turns "speaking".
  Without `inMs`, it uses the gap it measured on earlier turns.
* **Sleep / wake:** while asleep, Neutral means the sleeping face; waking plays
  the Yawn.
* **Speech** comes from outside this folder: `../useSpeakingAvatar.ts` reads the
  audio player and calls `setSpeechLevel` (the mouth) every frame and, when the
  `speechGaze` feature is on, `setSpeechPhase` (looking away at pauses and back
  at the end). The demo has speech gaze on; the chat page has it off for now.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Coordinates and Conventions                                                      -->
<!-- -------------------------------------------------------------------------------- -->
# Coordinates and Conventions

* **Units:** SVG units, with the face a radius-100 circle at the origin. Negative
  y is up.
* **Left and right** always mean the screen's (the viewer's) left and right:
  `gazeX`, `Look Left`, `Glance Up Left`, `hand-left`.
* **Groups:** the features (eyes, mouth, extras, objects) sit in a group that
  slides with the head turn (`turnX` / `turnY`). Everything on the face leans
  with the head tilt.
* **Gaze** is measured from `SMILEY_USER_GAZE` (where the user is), so moving
  that one constant moves every look at the user and every look away.
* **Tuning constants** are named, at the top of the file that uses them:

| To tune… | Look in |
|---|---|
| A face | `actions/faceExpressions.ts` or `actions/faceAnimations.ts` |
| A movement's size or length | `actions/faceMotions.ts` |
| Easing, gaze, glances, blinks, wander, speech mouth gain | `useFaceController.ts` |
| Passive motions and their rest times | `behavior/passiveMotions.ts` |
| Breathing and the breath before speaking | `behavior/breathing.ts` |
| Face spots, heart defaults | `objects/faceObjects.ts` |
| Hand shapes and size, heart size, object shading | `render_2d/objectDrawing2D.ts` |
| Eye, brow, mouth, and extras geometry | `render_2d/faceDrawing2D.ts` |
| Colors and gradients | `render_2d/SmileyFace2D.tsx` |

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Working on It                                                                    -->
<!-- -------------------------------------------------------------------------------- -->
# Working on It

* **Use the demo page.** `/avatar-demo` needs no backend. `?avatar=smiley` (or
  `smiley-brows`) picks the avatar, and `?face=<name>` plays a name on load,
  so Vite's reload after each save lands back on it (`?face=Ponder` holds
  Ponder). Demo Setup's duration picker has "Hold" for keeping an expression.
  "Think, then reply" simulates a full turn: thinking, then the reply's text
  arrives (a breath in, plus a Nod and a Smiling Face sent as separate
  commands, the smile lasting into the speech), then the sample reply.
* **Checks:** `npm run build` in `frontend/` catches syntax and import errors.
  There is no frontend test suite, so check behavior on the demo page.

### Gotchas

* **Keep `no-transition` on the SVG.** `index.css` gives every element
  `transition: 0.2s`. On a face that redraws every frame, that makes the
  drawing trail its own values and lurch when motion stops.
  `SmileyFace2D` opts out with the `no-transition` class.
* **The renderer must stay pure:** no timers or state in `render_2d/`. Anything
  that animates reads the face's clocks.
* **Names are public.** Renaming an expression, movement, or animation breaks
  anything that sends the old name (admin buttons rebuild themselves, but saved
  links, `?face=` URLs, and the moods' lists do not).
* **Blending needs numbers.** A new `FaceState` field must be a number added to
  the base face and the blended-fields list in `state/faceState.ts`. Anything
  that can't blend as a number needs its own rules, like `objects`.
* **Other avatars:** the QT and Buddy avatars are clip-based 3D models outside
  this folder. Every avatar ignores the optional handle methods it doesn't
  list in `features` (`avatarRegistry.tsx`), so pages can call them freely.
