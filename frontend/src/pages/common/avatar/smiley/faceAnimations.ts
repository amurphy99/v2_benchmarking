/* The smiley's Animations: a face combined with movement and breath.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/faceAnimations`

These are the "Animations" category of the smiley's public actions
(`smileyActions.ts`): more than one kind of change at once. A face is written
like an expression (changes to the base face). There are two kinds:

  - held (Ponder): the face shows like an expression, for the action's
    `duration_ms`, and its movement comes from the face itself (its `wander`
    drift while held).
  - timed (Yawn, Glance Up): it runs at its own natural length. Its face (if it
    has one) shows by an amount over time while the face underneath settles to
    rest, `motion` moves the head on top, and `breath` is a deliberate breath
    taken as it starts. It holds the passive head motions like a movement does.
    One without a face leaves the face showing alone, so a held smile stays.

Names are verbs, like the movements, and never a mood's name (the "Thinking"
mood would otherwise shadow a "Thinking" animation).

*/
import type { BreathPlan          } from "./breathing";
import type { MotionOffsets       } from "./faceMotions";
import      { keyframes, mirrored } from "./faceMotions";
import type { FaceState           } from "./faceState";

// Yawn: its length, its deep breath, how far the head tips back, and the extra lean at the widest (the way its face leans)
const SMILEY_YAWN_MS         = 4_400;
const SMILEY_YAWN_BREATH     = {inMs: 1_300, peak: 0.045, holdMs: 1_300, exhaleMs: 1_500};
const SMILEY_YAWN_TIP_BACK   = 0.3;
const SMILEY_YAWN_EXTRA_TILT = 4;

// How much of the yawn's face shows over it: opening slowly, held wide, then closing
const SMILEY_YAWN_FRAMES: [number, number][] = [[0, 0], [0.3, 1], [0.62, 1], [0.9, 0], [1, 0]];

// Glance Up: lean and slide left a little (like one side of Sway) while the eyes and head turn up and to the right
// (turn and gaze run -1 to 1, `shift` is in face radii, `degrees` is the lean)
const SMILEY_GLANCE_UP = {lengthMs: 2_400, turn: 0.30, gaze: 0.60, shift: 0.15, degrees: 8};


// --------------------------------------------------------------------------------
// Animation Types
// --------------------------------------------------------------------------------
// A held animation: its face shows like an expression, for the action's `duration_ms`
type HeldAnimation = {
    kind  : "held";
    emoji : string | null;        // Emoji its look borrows from (shown on its button)
    face  : Partial<FaceState>;   // Its face, as changes to the base face
};

// A timed animation's face, and how much of it shows at `t` (0 to 1 over its length, 0 at both ends)
type TimedFace = {changes: Partial<FaceState>; amount: (t: number) => number};

// A timed animation: its own length, with its face, head movement, and breath over that time
type TimedAnimation = {
    kind     : "timed";
    emoji    : string | null;                   // Emoji its look borrows from (shown on its button)
    lengthMs : number;                          // Natural length (the action's `duration_ms` is ignored)
    face     : TimedFace | null;                // Its face (null leaves the face showing alone)
    motion   : (t: number) => MotionOffsets;    // Head and eye offsets at `t`, zero at both ends
    breath   : BreathPlan | null;               // Deliberate breath taken as it starts (null for none)
};

// One animation
export type FaceAnimation = HeldAnimation | TimedAnimation;


// ================================================================================
// Animations
// ================================================================================
// Every animation, keyed by its public name
const SMILEY_ANIMATIONS: Record<string, FaceAnimation> = {
    "Ponder": {
        kind  : "held",
        emoji : "🤔",
        face  : {brows: 1, browRaise: 0.25, browAsym: 1, browAngle: -0.1, mouthCurve: 0.05, mouthWidth: 0.55, mouthSide: -6, mouthSlant: -0.4, gazeX: -0.6, gazeY: -0.6, turnX: -0.2, turnY: -0.15, tilt: 8, wander: 1, handChin: 1},
    },
    "Yawn": {
        kind     : "timed",
        emoji    : "🥱",
        lengthMs : SMILEY_YAWN_MS,
        face     : {changes: {eyeArc: 1, eyeArcBend: -1, mouthCurve: -0.5, mouthOpen: 1.0, mouthWidth: 0.85, tongue: 0.7, tilt: -4, browRaise: 0.3, browAngle: 0.3, handMouth: 1, handDX: 34, handDY: 30, handTilt: -30}, amount: yawnAmount},
        motion   : yawnTipBack,
        breath   : SMILEY_YAWN_BREATH,
    },
    "Glance Up Right" : {kind: "timed", emoji: null, lengthMs: SMILEY_GLANCE_UP.lengthMs, face: null, motion: glanceUp,           breath: null},
    "Glance Up Left"  : {kind: "timed", emoji: null, lengthMs: SMILEY_GLANCE_UP.lengthMs, face: null, motion: mirrored(glanceUp), breath: null},
};

// Every animation with its emoji, in catalog order (for building buttons)
export const SMILEY_ANIMATION_LIST = Object.entries(SMILEY_ANIMATIONS).map(([name, animation]: [string, FaceAnimation]) => ({name, emoji: animation.emoji}));

// Find an animation by name, ignoring case (unknown names give undefined)
export function animationFor(name: string): FaceAnimation | undefined {
    const key = Object.keys(SMILEY_ANIMATIONS).find((animation: string) => animation.toLowerCase() === name.toLowerCase());
    return (key === undefined) ? undefined : SMILEY_ANIMATIONS[key];
}


// --------------------------------------------------------------------------------
// Yawn
// --------------------------------------------------------------------------------
// How much of the yawn's face shows
function yawnAmount(t: number): number {
    return keyframes(t, SMILEY_YAWN_FRAMES);
}

// Tip the head back and lean a little more as the mouth opens wide, coming back with it
function yawnTipBack(t: number): MotionOffsets {
    const amount = yawnAmount(t);
    return {turnY: -SMILEY_YAWN_TIP_BACK * amount, tilt: -SMILEY_YAWN_EXTRA_TILT * amount};
}


// --------------------------------------------------------------------------------
// Glance Up
// --------------------------------------------------------------------------------
// Lean and slide left while the eyes and head turn up and to the right, hold, then come back together
function glanceUp(t: number): MotionOffsets {
    const amount = keyframes(t, [[0, 0], [0.2, 1], [0.8, 1], [1, 0]]);
    return {
        tilt    : -SMILEY_GLANCE_UP.degrees * amount,   // Negative tilt leans left
        offsetX : -SMILEY_GLANCE_UP.shift   * amount,   // ...and the whole face slides that way
        gazeX   :  SMILEY_GLANCE_UP.gaze    * amount,   // Eyes right
        gazeY   : -SMILEY_GLANCE_UP.gaze    * amount,   // Eyes up
        turnX   :  SMILEY_GLANCE_UP.turn    * amount,   // Head right
        turnY   : -SMILEY_GLANCE_UP.turn    * amount,   // Head up
    };
}
