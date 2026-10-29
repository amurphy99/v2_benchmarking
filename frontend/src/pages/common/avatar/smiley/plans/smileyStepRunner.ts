/* Run one plan step on the smiley: each action through the face controller's levers.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/plans/smileyStepRunner`

A step's actions (`AVATAR_PLANS.md` §3.3) all start at once, `reset` first.
Faces, movements, and animations are found here by name, and a movement is
scaled to its strength and speed; the other actions go straight to their layer.
A plan's names are checked against `SMILEY_PLAN_CATALOG` before it runs, so a
name not found here is a bug, and fails loudly. Each lever starts its action and
says how long it takes; the step's natural length is the longest of them.

*/
import type { BreathAction, GazeAction, MoveAction, PlanState } from "@/hooks/live-chat/avatarPlanFrames";
import type { PoseAction, PropAction, StepActions             } from "@/hooks/live-chat/avatarPlanFrames";
import type { FaceAnimation                                   } from "../actions/faceAnimations";
import      { animationFor                                    } from "../actions/faceAnimations";
import      { expressionFace                                  } from "../actions/faceExpressions";
import type { FaceMotion, MotionOffsets                       } from "../actions/faceMotions";
import      { motionFor, scaleOffsets                         } from "../actions/faceMotions";
import type { FaceState                                       } from "../state/faceState";


// --------------------------------------------------------------------------------
// Lever Types
// --------------------------------------------------------------------------------
// What a step can pull on the face controller: each lever starts its action now and returns how long it takes (ms)
export type SmileyLevers = {
    reset     : () => void;                                                                                              // Face to rest, the movement stopped, a plan's look and pose released, a held breath let go
    face      : (face: FaceState, strength: number, holdMs: number | null, inMs: number | null, outMs: number | null) => number;
    restFace  : () => number;
    motion    : (motion: FaceMotion) => number;
    animation : (animation: FaceAnimation, strength: number, holdMs: number | null) => number;
    look      : (action: GazeAction) => number;
    pose      : (action: PoseAction) => number;
    prop      : (action: PropAction) => number;
    breathe   : (action: BreathAction) => number;
    blink     : (ms: number | null) => number;
    state     : (state: PlanState) => number;
};


// ================================================================================
// Step Runner
// ================================================================================
// Start every action in a step (reset first), returning the step's natural length: its longest action
export function runSmileyStep(actions: StepActions, levers: SmileyLevers): number {
    if (actions.reset === true) levers.reset();

    // One length per action, from its lever
    const {face, move, animation, pose, gaze, prop, breath, blink, state} = actions;
    const lengths: number[] = [0];
    if (face      !== undefined) lengths.push((face === "rest") ? levers.restFace() : levers.face(namedFace(face.name), face.strength, face.hold_ms, face.in_ms, face.out_ms));
    if (move      !== undefined) lengths.push(levers.motion(scaledMotion(namedMotion(move.name), move)));
    if (animation !== undefined) lengths.push(levers.animation(namedAnimation(animation.name), animation.strength, animation.hold_ms));
    if (pose      !== undefined) lengths.push(levers.pose(pose));
    if (gaze      !== undefined) lengths.push(levers.look(gaze));
    if (prop      !== undefined) lengths.push(levers.prop(prop));
    if (breath    !== undefined) lengths.push(levers.breathe(breath));
    if (blink     !== undefined) lengths.push(levers.blink(blink.ms));
    if (state     !== undefined) lengths.push(levers.state(state));
    return Math.max(...lengths);
}

// A movement at a plan's size and speed
function scaledMotion(motion: FaceMotion, move: MoveAction): FaceMotion {
    return {durationMs: motion.durationMs / move.speed, sample: (t: number): MotionOffsets => scaleOffsets(motion.sample(t), move.strength)};
}


// --------------------------------------------------------------------------------
// Names
// --------------------------------------------------------------------------------
// The face a checked expression name means
function namedFace(name: string): FaceState {
    const face = expressionFace(name);
    if (face === null) throw new Error(`Expression "${name}" passed the plan's name check but has no face`);
    return face;
}

// The motion a checked movement name means
function namedMotion(name: string): FaceMotion {
    const motion = motionFor(name);
    if (motion === undefined) throw new Error(`Movement "${name}" passed the plan's name check but has no motion`);
    return motion;
}

// The animation a checked animation name means
function namedAnimation(name: string): FaceAnimation {
    const animation = animationFor(name);
    if (animation === undefined) throw new Error(`Animation "${name}" passed the plan's name check but isn't in the catalog`);
    return animation;
}
