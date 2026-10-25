/* Named head and eye motions the smiley avatar plays for `animation` actions.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/faceMotions`

A motion is a short set of offsets added on top of whatever expression is
showing, so a nod never clears a held smile. Every motion starts and ends at
zero offset, which is how it returns to Neutral when it finishes.

Each motion's length and size are the tuning constants at the top of this file,
and `SMILEY_MOTION_SPEED` speeds up or slows down all of them at once. A motion
that favors one side is written once and listed a second time through
`mirrored()`, which flips it left to right.

*/
import type { FaceState } from "./faceState";

// Plays every motion faster (above 1) or slower (below 1)
const SMILEY_MOTION_SPEED = 1;

// Offsets that point left or right, which a mirrored motion negates (up and down stay as they are)
const SMILEY_MIRRORED_OFFSETS: (keyof MotionOffsets)[] = ["gazeX", "turnX", "tilt", "offsetX"];

// Length and size of each motion (turn and gaze run -1 to 1; `shift` and `height` move the
// whole face, in face radii; `degrees` is head tilt)
const SMILEY_NOD_MOTION         = {durationMs:   900, turn: 0.75,                                                              swings: 2};   // Head dips down and back up `swings` times
const SMILEY_SHAKE_NO_MOTION    = {durationMs: 1_100, turn: 0.80, gaze: 0.50, shift: 0.05,                                     swings: 2};   // Head turns side to side, eyes following
const SMILEY_LOOK_SIDE_MOTION   = {durationMs: 1_800, turn: 0.80, gaze: 1.00, shift: 0.10                                               };   // Look Left and Look Right: turn, hold, come back
const SMILEY_LOOK_AROUND_MOTION = {durationMs: 3_200, turn: 0.80, gaze: 1.00, shift: 0.10                                               };   // Left, then right, then back to the middle
const SMILEY_SWAY_MOTION        = {durationMs: 1_800,                         shift: 0.18,               degrees:  8,          swings: 2};   // Whole face rocks side to side
const SMILEY_BOUNCE_MOTION      = {durationMs:   900,                                      height: 0.30,              hops: 2           };   // Hops straight up `hops` times
const SMILEY_HEAD_TILT_MOTION   = {durationMs: 1_600,                                                    degrees: 22                    };   // Leans to one side, holds, comes back
const SMILEY_TILT_TURN_MOTION   = {durationMs: 2_400, turn: 0.30, gaze: 0.60,                            degrees:  8                    };   // Leans a little left while the eyes and head turn up and to the right (eyes the same amount on both axes)


// --------------------------------------------------------------------------------
// Motion Types
// --------------------------------------------------------------------------------
// Face fields a motion moves, as offsets added to the expression
export type MotionOffsets = Partial<Pick<FaceState, "gazeX" | "gazeY" | "turnX" | "turnY" | "tilt" | "offsetX" | "offsetY">>;

// One named motion: its length and its offsets over time
export type FaceMotion = {
    durationMs : number;                          // Length of the motion
    sample     : (t: number) => MotionOffsets;    // Offsets at `t`, from 0 (start) to 1 (end)
};


// ================================================================================
// Motions
// ================================================================================
// Every motion, keyed by the name an `animation` action sends
const SMILEY_MOTIONS: Record<string, FaceMotion> = {
    "Nod"                           : {durationMs: SMILEY_NOD_MOTION.durationMs,         sample: nod           },
    "Shake No"                      : {durationMs: SMILEY_SHAKE_NO_MOTION.durationMs,    sample: shakeNo       },
    "Look Left"                     : {durationMs: SMILEY_LOOK_SIDE_MOTION.durationMs,   sample: (t: number): MotionOffsets => lookToward(-1, t)},
    "Look Right"                    : {durationMs: SMILEY_LOOK_SIDE_MOTION.durationMs,   sample: (t: number): MotionOffsets => lookToward( 1, t)},
    "Look Around"                   : {durationMs: SMILEY_LOOK_AROUND_MOTION.durationMs, sample: lookAround    },
    "Sway"                          : {durationMs: SMILEY_SWAY_MOTION.durationMs,        sample: sway          },
    "Bounce"                        : {durationMs: SMILEY_BOUNCE_MOTION.durationMs,      sample: bounce        },
    "Head Tilt"                     : {durationMs: SMILEY_HEAD_TILT_MOTION.durationMs,   sample: headTilt      },
    "Tilt, Turn, and Look Up Right" : {durationMs: SMILEY_TILT_TURN_MOTION.durationMs,   sample: tiltTurnGlance},
    "Tilt, Turn, and Look Up Left"  : {durationMs: SMILEY_TILT_TURN_MOTION.durationMs,   sample: mirrored(tiltTurnGlance)},
};

// Motion names, as the admin panel and demo page offer them
export const SMILEY_ANIMATIONS = Object.keys(SMILEY_MOTIONS);

// Find a motion by name, ignoring case, at the current motion speed (unknown names give undefined)
export function motionFor(name: string): FaceMotion | undefined {
    const key = SMILEY_ANIMATIONS.find((motion: string) => motion.toLowerCase() === name.toLowerCase());
    if (key === undefined) return undefined;
    return {...SMILEY_MOTIONS[key], durationMs: SMILEY_MOTIONS[key].durationMs / SMILEY_MOTION_SPEED};
}


// --------------------------------------------------------------------------------
// Motion Shapes
// --------------------------------------------------------------------------------
// Dip the head down and back up
function nod(t: number): MotionOffsets {
    return {turnY: SMILEY_NOD_MOTION.turn * swing(t, SMILEY_NOD_MOTION.swings)};
}

// Turn the head side to side, with the eyes following
function shakeNo(t: number): MotionOffsets {
    const amount = swing(t, SMILEY_SHAKE_NO_MOTION.swings);
    return {
        turnX   : SMILEY_SHAKE_NO_MOTION.turn  * amount,
        gazeX   : SMILEY_SHAKE_NO_MOTION.gaze  * amount,
        offsetX : SMILEY_SHAKE_NO_MOTION.shift * amount,
    };
}

// Turn and glance to one side, hold, then come back (`side` is -1 for left, 1 for right)
function lookToward(side: number, t: number): MotionOffsets {
    const amount = side * keyframes(t, [[0, 0], [0.2, 1], [0.75, 1], [1, 0]]);
    return {
        turnX   : SMILEY_LOOK_SIDE_MOTION.turn  * amount,
        gazeX   : SMILEY_LOOK_SIDE_MOTION.gaze  * amount,
        offsetX : SMILEY_LOOK_SIDE_MOTION.shift * amount,
    };
}

// Look left, then right, then back to the middle (the eyes lead the head slightly)
function lookAround(t: number): MotionOffsets {
    const turn = keyframes(t, [[0, 0], [0.15, -1], [0.35, -1], [0.55, 1], [0.75, 1], [0.9, 0], [1, 0]]);
    const look = keyframes(t, [[0, 0], [0.10, -1], [0.33, -1], [0.48, 1], [0.73, 1], [0.85, 0], [1, 0]]);
    return {
        turnX   : SMILEY_LOOK_AROUND_MOTION.turn  * turn,
        gazeX   : SMILEY_LOOK_AROUND_MOTION.gaze  * look,
        gazeY   : -0.2 * Math.abs(turn),
        offsetX : SMILEY_LOOK_AROUND_MOTION.shift * turn,
    };
}

// Rock the whole face side to side, leaning into each sway
function sway(t: number): MotionOffsets {
    const amount = swing(t, SMILEY_SWAY_MOTION.swings);
    return {offsetX: SMILEY_SWAY_MOTION.shift * amount, tilt: SMILEY_SWAY_MOTION.degrees * amount};
}

// Hop straight up and land, `hops` times
function bounce(t: number): MotionOffsets {
    return {offsetY: -SMILEY_BOUNCE_MOTION.height * Math.abs(Math.sin(Math.PI * SMILEY_BOUNCE_MOTION.hops * t))};
}

// Lean to one side, hold, then straighten
function headTilt(t: number): MotionOffsets {
    return {tilt: SMILEY_HEAD_TILT_MOTION.degrees * keyframes(t, [[0, 0], [0.2, 1], [0.8, 1], [1, 0]])};
}

// Lean left while the eyes and head turn up and to the right, hold, then come back together
function tiltTurnGlance(t: number): MotionOffsets {
    const amount = keyframes(t, [[0, 0], [0.2, 1], [0.8, 1], [1, 0]]);
    return {
        tilt  : -SMILEY_TILT_TURN_MOTION.degrees * amount,   // Negative tilt leans left
        gazeX :  SMILEY_TILT_TURN_MOTION.gaze    * amount,   // Eyes right
        gazeY : -SMILEY_TILT_TURN_MOTION.gaze    * amount,   // Eyes up
        turnX :  SMILEY_TILT_TURN_MOTION.turn    * amount,   // Head right
        turnY : -SMILEY_TILT_TURN_MOTION.turn    * amount,   // Head up
    };
}

// Flip a motion left to right (the lean, head turn, gaze, and sideways shift change sides)
function mirrored(sample: FaceMotion["sample"]): FaceMotion["sample"] {
    return (t: number): MotionOffsets => {
        const offsets = {...sample(t)};
        for (const key of SMILEY_MIRRORED_OFFSETS) {
            const value = offsets[key];   // A motion moves only some fields
            if (value !== undefined) offsets[key] = -value;
        }
        return offsets;
    };
}

// Back-and-forth swing that fades in and out (`cycles` full swings over the motion)
function swing(t: number, cycles: number): number {
    return Math.sin(2 * Math.PI * cycles * t) * Math.sin(Math.PI * t);
}

// Ease between [time, value] keyframes (times ascend from 0 to 1)
function keyframes(t: number, frames: [number, number][]): number {
    for (let i = 1; i < frames.length; i++) {
        const [endT, endValue] = frames[i];
        if (t > endT) continue;

        // Ease between the two frames around `t`
        const [startT, startValue] = frames[i - 1];
        return startValue + ((endValue - startValue) * smoothstep((t - startT) / (endT - startT)));
    }
    return frames[frames.length - 1][1];
}

// Ease from 0 to 1 that starts and stops with zero speed
export function smoothstep(u: number): number {
    return u * u * (3 - (2 * u));
}
