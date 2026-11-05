/* Where the smiley's eyes and head point: automatic looks and commanded ones.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/behavior/gaze`

Each frame the face controller asks this where the eyes go (a gaze offset added
to the expression's own) and how the head turns and leans (added to the
expression's pose). The eyes go, in order of priority, to:

  1) a point the page sets (the demo's gaze pad)
  2) a look a plan asks for (`AVATAR_PLANS.md` §3.3.1): a point in the user,
     screen, or map frame, a scan of short fixations around one, or a trace
     along a path, holding for its `hold_ms` and then releasing. It lands where
     it says, whatever the expression's own gaze is, and can turn the head part
     of the way with the eyes
  3) the speech phase's look while it speaks (away at pauses, aside over the
     last few words, back at the user as it finishes), when speech gaze is on
  4) the conversation state's look: at the user while listening, up and to the
     side while thinking (when the thinking look is on, else at the user)
  5) small idle glances around the user (when they are on), or the user

The eyes jump to each new target with a fast ease. Expressions that set
`wander` (Ponder) add a slow drift around the expression's pose: the eyes hop
between nearby points, the head turns after them more slowly, and its lean
sways; it fades out under a plan's look. A plan can also hold the head in a
pose (`pose`), eased in and out over its own time.

Map points (0 to 1 from the top-left of the map as the avatar reads it) are
mirrored on screen and follow how far the map is raised: a spot on the lowered
map is a lower look than the same spot raised (`render_2d/SmileyMap2D` draws it
there, and its raised top edge sits just under the eyes' lowest map look).

*/
import type { AutoBehaviors, GazeAction, GazeFrame, GazeLook, PlanPoint, PoseAction } from "@/hooks/live-chat/avatarPlanFrames";
import type { ConversationState, SpeechPhase                                        } from "../../avatarRegistry";
import type { Ease                                                                  } from "../actions/faceMotions";
import      { clampRange, easeAt, easeStep, easeToward, randomBetween               } from "../actions/faceMotions";

// Where the user is, in gaze units (every look at the user, and every look away, is measured from it)
const SMILEY_USER_GAZE: GazePoint = {x: 0, y: 0};

// Easing rates (how quickly each part closes the gap to its target, per second)
const SMILEY_GAZE_EASE_PER_SEC        = 14;    // Eyes jumping to a new point
const SMILEY_HEAD_FOLLOW_EASE_PER_SEC = 4;     // The head turning after the eyes on a plan's look
const SMILEY_WANDER_MIX_EASE_PER_SEC  = 5;     // The wander fading out under a plan's look, and back

// Idle glances
const SMILEY_GLANCE_INTERVAL_MIN_MS = 1_200;   // Shortest time between glances
const SMILEY_GLANCE_INTERVAL_MAX_MS = 3_500;   // Longest time between glances
const SMILEY_GLANCE_RANGE           = 0.35;    // Farthest a glance strays from the user (gaze units)
const SMILEY_GLANCE_CENTER_CHANCE   = 0.40;    // Chance a glance comes back to the user

// The thinking look, and the speech-phase looks while it speaks (gaze offsets from the user; "finishing" looks straight at the user)
const SMILEY_THINKING_GAZE = {x:  0.55, y: -0.55};   // Eyes drift up and to the side
const SMILEY_PAUSE_GAZE    = {x:  0.55, y: -0.50};   // Up and to the right between sentences
const SMILEY_WRAP_UP_GAZE  = {x: -0.60, y:  0.15};   // Aside (left, a little down) over the last few words

// Wander while an expression with `wander` is held (eyes hop near its gaze; the head follows them and sways)
const SMILEY_WANDER_GAZE_RANGE        = 0.15;    // Farthest a hop strays from the expression's gaze (gaze units)
const SMILEY_WANDER_INTERVAL_MIN_MS   =   700;   // Shortest time between hops
const SMILEY_WANDER_INTERVAL_MAX_MS   = 1_800;   // Longest time between hops
const SMILEY_WANDER_HEAD_FOLLOW       = 0.35;    // Head turn per unit of hop (the eyes move farther than the head)
const SMILEY_WANDER_HEAD_EASE_PER_SEC = 2.5;     // How quickly the head turns after the eyes
const SMILEY_WANDER_SWAY_DEG          = 1.5;     // Lean sway either way
const SMILEY_WANDER_SWAY_PERIOD_MS    = 5_500;   // One sway there and back

// A plan's look: the eyes' time to get there (part of a look's length), and what a plan leaves out (`AVATAR_PLANS.md` §3.3.1)
const SMILEY_GAZE_SETTLE_MS = 200;
const SMILEY_SCAN_FIX_MS    = [250, 450] as const;      // Shortest and longest fixation in a scan
const SMILEY_TRACE_SPEED    = {map: 0.5, other: 1};     // Frame units per second along a trace
const SMILEY_HEAD_SHARE     = {map: 0.3, other: 0};     // Share of the eyes' shift the head turns too

// Map points as gaze: across (the avatar's left is the viewer's right, so it flips), and down the map's top and bottom
// rows, lowered and then raised
const SMILEY_MAP_MIRRORED     = true;
const SMILEY_MAP_GAZE_ACROSS  = 0.8;                     // Gaze at the map's left and right edges
const SMILEY_MAP_GAZE_LOWERED = [0.80, 1.00] as const;   // Gaze at its top and bottom rows, lowered
const SMILEY_MAP_GAZE_RAISED  = [0.20, 0.62] as const;   // ...and raised (keeping the eyes above its top edge)

// A held head pose: how long moving into it (and back out) takes when a plan leaves it out
const SMILEY_POSE_MOVE_MS = 400;


// --------------------------------------------------------------------------------
// Gaze Types
// --------------------------------------------------------------------------------
// A gaze point, -1 to 1 on each axis
export type GazePoint = {x: number; y: number};

// What the face controller knows each frame
export type GazeInput = {
    nowMs          : number;
    dtSec          : number;
    conversation   : ConversationState;
    phase          : SpeechPhase;
    expressionGaze : GazePoint;       // The expression's own gaze (a plan's look lands where it says regardless)
    wander         : number;          // The expression's `wander`, 0 to 1
    mapRaise       : number;          // How far the map is raised (map points follow it)
    motionPlaying  : boolean;         // A movement or animation is playing (no idle glances meanwhile)
    auto           : AutoBehaviors;   // Which automatic looks run
};

// This frame's look: the eyes' offset (added to the expression's gaze) and the head's (added to its pose)
export type Look = {eyes: GazePoint; turnX: number; turnY: number; tilt: number};

// What the face controller drives (a plan's look or pose returns how long it takes, ms)
export type Gaze = {
    setPoint : (point: GazePoint | null) => void;
    command  : (action: GazeAction, nowMs: number) => number;
    pose     : (action: PoseAction, nowMs: number) => number;
    release  : (nowMs: number) => void;                        // Drop a plan's look, and ease out of its pose
    step     : (input: GazeInput) => Look;
};

// A plan's look in progress (a null `endMs` holds until something replaces it)
type CommandedLook = {
    on        : GazeFrame;
    look      : GazeLook;
    head      : number;       // Share of the eyes' shift the head turns too
    startMs   : number;
    endMs     : number | null;
    fixation  : PlanPoint;    // A scan's current point
    nextFixMs : number;       // When a scan moves on to its next point
};

// A held head pose: each amount's ease, when it starts easing back out, and how long moving takes
type HeldPose = {turnX: Ease; turnY: Ease; tilt: Ease; releaseAtMs: number | null; moveMs: number};


// ================================================================================
// Gaze
// ================================================================================
// Start looking at the user, with no plan's look or pose
export function createGaze(startMs: number): Gaze {
    // The page's point, a plan's look, and a plan's pose
    let pagePoint : GazePoint | null     = null;
    let commanded : CommandedLook | null = null;
    let pose      : HeldPose             = restingPose(startMs);

    // Eased state: the eyes, idle glances, the head following a plan's look, and the wander
    let gaze         : GazePoint = SMILEY_USER_GAZE;
    let idleGaze     : GazePoint = SMILEY_USER_GAZE;
    let nextGlanceAt : number    = startMs + randomBetween(SMILEY_GLANCE_INTERVAL_MIN_MS, SMILEY_GLANCE_INTERVAL_MAX_MS);
    let follow       : GazePoint = {x: 0, y: 0};
    let wanderPoint  : GazePoint = {x: 0, y: 0};   // Hop the eyes are heading to, from the expression's gaze
    let wanderEyes   : GazePoint = {x: 0, y: 0};
    let wanderHead   : GazePoint = {x: 0, y: 0};
    let wanderMix    : number    = 1;              // 0 under a plan's look
    let nextWanderAt : number    = startMs;

    // Ease a held pose back to no added pose over its own move time
    const easeOutOfPose = (nowMs: number): void => {
        pose = {...poseToward(pose, [0, 0], 0, pose.moveMs, nowMs), releaseAtMs: null};
    };

    // --------------------------------------------------------------------------------
    // Frame Step
    // --------------------------------------------------------------------------------
    const step = (input: GazeInput): Look => {
        const {nowMs, dtSec} = input;

        // 1) A plan's look releases once its hold is over, and a held pose eases out once its hold is
        if ((commanded !== null) && (commanded.endMs !== null) && (nowMs >= commanded.endMs)) commanded = null;
        if ((pose.releaseAtMs !== null) && (nowMs >= pose.releaseAtMs)) easeOutOfPose(nowMs);

        // 2) Idle glances (none during a movement, or right after one)
        if (input.motionPlaying) nextGlanceAt = Math.max(nextGlanceAt, nowMs + SMILEY_GLANCE_INTERVAL_MIN_MS);
        if (nowMs >= nextGlanceAt) {
            idleGaze     = (Math.random() < SMILEY_GLANCE_CENTER_CHANCE) ? SMILEY_USER_GAZE : fromUser({x: randomBetween(-SMILEY_GLANCE_RANGE, SMILEY_GLANCE_RANGE), y: randomBetween(-SMILEY_GLANCE_RANGE, SMILEY_GLANCE_RANGE)});
            nextGlanceAt = nowMs + randomBetween(SMILEY_GLANCE_INTERVAL_MIN_MS, SMILEY_GLANCE_INTERVAL_MAX_MS);
        }

        // 3) The eyes' target: the page's point, else a plan's look (landing where it says), else the automatic look
        const planned = ((pagePoint === null) && (commanded !== null)) ? commandedPoint(commanded, nowMs, input.mapRaise) : null;
        const target  =
            (pagePoint !== null) ? pagePoint                                                                        :
            (planned   !== null) ? {x: planned.x - input.expressionGaze.x, y: planned.y - input.expressionGaze.y} :
                                   automaticLook(input, idleGaze);
        const eyesStep = easeStep(SMILEY_GAZE_EASE_PER_SEC, dtSec);
        gaze = {x: gaze.x + ((target.x - gaze.x) * eyesStep), y: gaze.y + ((target.y - gaze.y) * eyesStep)};

        // 4) The head turns part of the way after a plan's look
        const followTarget = (planned === null) || (commanded === null) ? {x: 0, y: 0} : {x: commanded.head * (planned.x - SMILEY_USER_GAZE.x), y: commanded.head * (planned.y - SMILEY_USER_GAZE.y)};
        const followStep   = easeStep(SMILEY_HEAD_FOLLOW_EASE_PER_SEC, dtSec);
        follow = {x: follow.x + ((followTarget.x - follow.x) * followStep), y: follow.y + ((followTarget.y - follow.y) * followStep)};

        // 5) Wander: hop the eyes to a nearby point now and then, the head easing after them (scaled by the expression's
        //    `wander`, and fading out under a plan's look)
        if (nowMs >= nextWanderAt) {
            wanderPoint  = {x: randomBetween(-SMILEY_WANDER_GAZE_RANGE, SMILEY_WANDER_GAZE_RANGE), y: randomBetween(-SMILEY_WANDER_GAZE_RANGE, SMILEY_WANDER_GAZE_RANGE)};
            nextWanderAt = nowMs + randomBetween(SMILEY_WANDER_INTERVAL_MIN_MS, SMILEY_WANDER_INTERVAL_MAX_MS);
        }
        const headStep = easeStep(SMILEY_WANDER_HEAD_EASE_PER_SEC, dtSec);
        wanderEyes = {x: wanderEyes.x + ((wanderPoint.x - wanderEyes.x) * eyesStep), y: wanderEyes.y + ((wanderPoint.y - wanderEyes.y) * eyesStep)};
        wanderHead = {x: wanderHead.x + ((wanderPoint.x - wanderHead.x) * headStep), y: wanderHead.y + ((wanderPoint.y - wanderHead.y) * headStep)};
        wanderMix += (((planned === null) ? 1 : 0) - wanderMix) * easeStep(SMILEY_WANDER_MIX_EASE_PER_SEC, dtSec);
        const wander = input.wander * wanderMix;
        const sway   = SMILEY_WANDER_SWAY_DEG * Math.sin((2 * Math.PI * nowMs) / SMILEY_WANDER_SWAY_PERIOD_MS);

        // 6) Everything the eyes and head add up to this frame
        return {
            eyes  : {x: gaze.x + (wander * wanderEyes.x), y: gaze.y + (wander * wanderEyes.y)},
            turnX : (wander * wanderHead.x * SMILEY_WANDER_HEAD_FOLLOW) + follow.x + easeAt(pose.turnX, nowMs),
            turnY : (wander * wanderHead.y * SMILEY_WANDER_HEAD_FOLLOW) + follow.y + easeAt(pose.turnY, nowMs),
            tilt  : (wander * sway) + easeAt(pose.tilt, nowMs),
        };
    };

    // --------------------------------------------------------------------------------
    // Page Points and Plan Commands
    // --------------------------------------------------------------------------------
    return {
        step,

        // The page's point, over everything else (null goes back to the plan's look or the automatic one)
        setPoint: (point: GazePoint | null): void => { pagePoint = point; },

        // A plan's look replaces the one before; "release" goes back to the automatic look
        command: (action: GazeAction, nowMs: number): number => {
            if (action === "release") {
                commanded = null;
                return 0;
            }
            const lengthMs = lookLengthMs(action.on, action.look, action.hold_ms);
            commanded = {
                on        : action.on,
                look      : action.look,
                head      : action.head ?? ((action.on === "map") ? SMILEY_HEAD_SHARE.map : SMILEY_HEAD_SHARE.other),
                startMs   : nowMs,
                endMs     : (action.hold_ms === null) ? null : (nowMs + lengthMs),
                fixation  : (action.look.kind === "scan") ? action.look.around : [0, 0],
                nextFixMs : nowMs,
            };
            return lengthMs;
        },

        // A plan's head pose: eased into over its move time, held, then eased back out ("rest" eases out now)
        pose: (action: PoseAction, nowMs: number): number => {
            if (action === "rest") {
                easeOutOfPose(nowMs);
                return 0;
            }
            const moveMs = action.move_ms ?? SMILEY_POSE_MOVE_MS;
            pose = {...poseToward(pose, action.turn, action.tilt, moveMs, nowMs), releaseAtMs: (action.hold_ms === null) ? null : (nowMs + moveMs + action.hold_ms)};
            return moveMs + (action.hold_ms ?? 0);
        },

        // Drop a plan's look, and ease out of its pose (a reset)
        release: (nowMs: number): void => {
            commanded = null;
            easeOutOfPose(nowMs);
        },
    };
}


// --------------------------------------------------------------------------------
// Automatic Looks
// --------------------------------------------------------------------------------
// The speech phase's look (when speech gaze is on), else the conversation state's, else an idle glance (when on) or the user
function automaticLook(input: GazeInput, idleGaze: GazePoint): GazePoint {
    const {phase, conversation, auto} = input;
    if (auto.speech_gaze) {
        if (phase === "pausing"    ) return fromUser(SMILEY_PAUSE_GAZE  );
        if (phase === "wrapping-up") return fromUser(SMILEY_WRAP_UP_GAZE);
        if (phase === "finishing"  ) return SMILEY_USER_GAZE;
    }
    if (conversation === "listening") return SMILEY_USER_GAZE;
    if (conversation === "thinking" ) return auto.thinking_look ? fromUser(SMILEY_THINKING_GAZE) : SMILEY_USER_GAZE;
    return auto.idle_glances ? idleGaze : SMILEY_USER_GAZE;
}

// Gaze point at an offset from where the user is
function fromUser(offset: GazePoint): GazePoint {
    return {x: SMILEY_USER_GAZE.x + offset.x, y: SMILEY_USER_GAZE.y + offset.y};
}


// --------------------------------------------------------------------------------
// Plan Looks
// --------------------------------------------------------------------------------
// Where a plan's look points now, as a gaze point (a scan moves on to its next fixation when due; a trace moves along its path)
function commandedPoint(commanded: CommandedLook, nowMs: number, mapRaise: number): GazePoint {
    const {on, look} = commanded;
    if (look.kind === "point") return frameToGaze(on, look.at, mapRaise);
    if (look.kind === "scan") {
        if (nowMs >= commanded.nextFixMs) {
            const [shortest, longest] = look.fix_ms ?? SMILEY_SCAN_FIX_MS;
            commanded.fixation  = scanPoint(on, look.around, look.radius);
            commanded.nextFixMs = nowMs + randomBetween(shortest, longest);
        }
        return frameToGaze(on, commanded.fixation, mapRaise);
    }
    return frameToGaze(on, pointAlong(look.path, ((nowMs - commanded.startMs) / 1_000) * traceSpeed(on, look.speed)), mapRaise);
}

// How long a plan's look takes: the eyes getting there (a point), or along its path (a trace), plus its hold
function lookLengthMs(on: GazeFrame, look: GazeLook, holdMs: number | null): number {
    const held = holdMs ?? 0;
    if (look.kind === "point") return SMILEY_GAZE_SETTLE_MS + held;
    if (look.kind === "scan" ) return held;
    return ((pathLength(look.path) / traceSpeed(on, look.speed)) * 1_000) + held;
}

// A trace's speed in its frame's units per second
function traceSpeed(on: GazeFrame, speed: number | null): number {
    return speed ?? ((on === "map") ? SMILEY_TRACE_SPEED.map : SMILEY_TRACE_SPEED.other);
}

// A point in a gaze frame, as a gaze point (user points are offsets from the user; map points flip and follow the map's raise)
function frameToGaze(on: GazeFrame, [x, y]: PlanPoint, mapRaise: number): GazePoint {
    if (on === "user"  ) return fromUser({x, y});
    if (on === "screen") return {x, y};
    const across = SMILEY_MAP_MIRRORED ? (0.5 - x) : (x - 0.5);
    const top    = SMILEY_MAP_GAZE_LOWERED[0] + ((SMILEY_MAP_GAZE_RAISED[0] - SMILEY_MAP_GAZE_LOWERED[0]) * mapRaise);
    const bottom = SMILEY_MAP_GAZE_LOWERED[1] + ((SMILEY_MAP_GAZE_RAISED[1] - SMILEY_MAP_GAZE_LOWERED[1]) * mapRaise);
    return {x: 2 * across * SMILEY_MAP_GAZE_ACROSS, y: top + ((bottom - top) * y)};
}

// A random point in a scan's circle, kept inside its frame (map points run 0 to 1, the others -1 to 1)
function scanPoint(on: GazeFrame, [aroundX, aroundY]: PlanPoint, radius: number): PlanPoint {
    const reach = radius * Math.sqrt(Math.random());   // Square root spreads the points evenly over the circle
    const angle = 2 * Math.PI * Math.random();
    const [low, high] = (on === "map") ? [0, 1] : [-1, 1];
    return [clampRange(aroundX + (reach * Math.cos(angle)), low, high), clampRange(aroundY + (reach * Math.sin(angle)), low, high)];
}

// Total length of a path
function pathLength(path: PlanPoint[]): number {
    let length = 0;
    for (let i = 1; i < path.length; i++) length += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    return length;
}

// The point `distance` along a path (its last point once past the end)
function pointAlong(path: PlanPoint[], distance: number): PlanPoint {
    let left = distance;
    for (let i = 1; i < path.length; i++) {
        const [fromX, fromY] = path[i - 1];
        const [toX,   toY  ] = path[i];
        const segment = Math.hypot(toX - fromX, toY - fromY);
        if (left <= segment) {
            const t = (segment === 0) ? 1 : (left / segment);
            return [fromX + ((toX - fromX) * t), fromY + ((toY - fromY) * t)];
        }
        left -= segment;
    }
    return path[path.length - 1];
}


// --------------------------------------------------------------------------------
// Head Poses
// --------------------------------------------------------------------------------
// No added pose
function restingPose(nowMs: number): HeldPose {
    const still: Ease = {from: 0, to: 0, startMs: nowMs, lengthMs: 0};
    return {turnX: still, turnY: still, tilt: still, releaseAtMs: null, moveMs: SMILEY_POSE_MOVE_MS};
}

// A pose eased toward a turn and tilt from wherever it is now
function poseToward(pose: HeldPose, [turnX, turnY]: PlanPoint, tilt: number, moveMs: number, nowMs: number): HeldPose {
    return {
        turnX       : easeToward(pose.turnX, turnX, moveMs, nowMs),
        turnY       : easeToward(pose.turnY, turnY, moveMs, nowMs),
        tilt        : easeToward(pose.tilt,  tilt,  moveMs, nowMs),
        releaseAtMs : pose.releaseAtMs,
        moveMs,
    };
}
