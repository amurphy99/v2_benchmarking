/* Avatar plan checks: a setup or plan frame checked whole where it arrives.
--------------------------------------------------------------------------------
`@frontend/src/hooks/live-chat/avatarPlanChecks`

A plan runs completely or not at all (`pages/common/avatar/AVATAR_PLANS.md` §7).
`parseAvatarPlan` and `parseAvatarSetup` check a frame's shape, types, ranges,
and limits, and return either the frame as the client runs it
(`avatarPlanFrames`) or the rejection to send back. `checkPlanNames` and
`checkSetupNames` then check the names it uses against the avatar's catalog,
before anything runs.

*/
import type { AnimationAction, AutoBehaviors, AvatarFeedback, AvatarPlan, AvatarSetup, BlinkAction, BreathAction } from "./avatarPlanFrames";
import type { FaceAction, GazeAction, GazeFrame, GazeLook, MoveAction, PlanCatalog, PlanMoment                   } from "./avatarPlanFrames";
import type { PlanPoint, PlanState, PlanStep, PoseAction, PropAction, StepActions                                } from "./avatarPlanFrames";
import      { AUTO_BEHAVIORS, GAZE_FRAMES, PLAN_FEEDBACK_MODES, PLAN_MOMENT_NAMES, PLAN_STATES, PROP_NAMES       } from "./avatarPlanFrames";

// Limits a plan stays within (`AVATAR_PLANS.md` §7)
const PLAN_MAX_STEPS         = 64;
const PLAN_MAX_PATH_POINTS   = 64;
const PLAN_MAX_ID_CHARS      = 128;
const PLAN_MAX_NAME_CHARS    = 100;
const PLAN_MAX_MS            = 60_000;   // Any duration or wait
const PLAN_MAX_TRANSITION_MS = 5_000;    // Moving in or out (a face, a pose, the prop), and a breath's hold
const PLAN_MAX_AUDIO_HOLD_MS = 1_000;
const PLAN_MAX_SENTENCE      = 999;

// Ranges of single fields
const PLAN_MOVE_SPEED_RANGE   = [0.25, 4    ] as const;   // `move.speed`
const PLAN_POSE_TILT_DEG      = 30;                       // `pose.tilt`, either way
const PLAN_TRACE_SPEED_RANGE  = [0.05, 10   ] as const;   // `gaze` trace speed, frame units per second
const PLAN_SCAN_FIX_MS_RANGE  = [50,   5_000] as const;   // `gaze` scan fixations
const PLAN_BREATH_IN_MS_RANGE = [100,  5_000] as const;
const PLAN_BREATH_OUTMS_RANGE = [100,  8_000] as const;
const PLAN_BREATH_DEPTH_RANGE = [0.005, 0.06] as const;   // Size change at the top, as a fraction
const PLAN_BLINK_MS_RANGE     = [80,   1_000] as const;

// How far a scan's circle may reach, in its frame's units (map coordinates run 0 to 1, the others -1 to 1)
const PLAN_SCAN_MAX_RADIUS = {map: 1, other: 2};

// Waiting steps are dropped this long after their plan arrives, unless the plan says otherwise
const PLAN_DEFAULT_EXPIRE_MS = 15_000;

// Fields each object may hold
const PLAN_KEYS   = ["id", "turn", "feedback", "expire_ms", "steps"] as const;
const TIMING_KEYS = ["start_on", "wait_ms", "hold_audio_ms", "response_id", "ms"] as const;
const ACTION_KEYS = ["reset", "face", "move", "animation", "pose", "gaze", "prop", "breath", "blink", "state"] as const;
const SETUP_KEYS  = ["rest", "auto"] as const;

// Each automatic behavior when a setup leaves it out (today's chat page)
const SETUP_DEFAULT_AUTO: AutoBehaviors = {idle_glances: true, thinking_look: true, speech_gaze: false, listening_motions: true};

// A checked frame, or the rejection to send back instead
export type ParsedFrame<T> = {ok: true; frame: T} | {ok: false; rejection: AvatarFeedback};


// ================================================================================
// Checking Frames on Arrival
// ================================================================================
// Check an `avatar_plan` frame's data: the plan to run, or why it was rejected (naming the plan when its id is readable)
export function parseAvatarPlan(data: unknown): ParsedFrame<AvatarPlan> {
    const id   = (isRecord(data) && (typeof data.id   === "string") && (data.id.length <= PLAN_MAX_ID_CHARS)) ? data.id   : null;
    const turn = (isRecord(data) && (typeof data.turn === "number") && Number.isInteger(data.turn))           ? data.turn : null;
    return parseFrame((): AvatarPlan => readPlan(data), id, turn);
}

// Check an `avatar_setup` frame's data: the settings to apply, or why they were rejected
export function parseAvatarSetup(data: unknown): ParsedFrame<AvatarSetup> {
    return parseFrame((): AvatarSetup => readSetup(data), null, null);
}

// Run a frame's checks, turning the first failure into the rejection to send back
function parseFrame<T>(read: () => T, id: string | null, turn: number | null): ParsedFrame<T> {
    try { return {ok: true, frame: read()}; }
    catch (error) {
        if (!(error instanceof FrameRejection)) throw error;
        const rejection: AvatarFeedback = {id, event: "rejected", reason: error.message};
        if (turn !== null) rejection.turn = turn;
        return {ok: false, rejection};
    }
}

// --------------------------------------------------------------------------------
// Names
// --------------------------------------------------------------------------------
// The first name a plan uses that the avatar can't run (null when it can run all of them)
export function checkPlanNames(plan: AvatarPlan, catalog: PlanCatalog): string | null {
    for (const [i, step] of plan.steps.entries()) {
        const {face, move, animation, gaze, prop} = step.actions;
        const path = `steps[${i}]`;

        // Faces, movements, and animations by name
        if ((face !== undefined) && (face !== "rest") && !hasName(catalog.expressions, face.name)) return `${path}.face.name: unknown expression "${face.name}"`;
        if ((move !== undefined) && !hasName(catalog.movements, move.name))                          return `${path}.move.name: unknown movement "${move.name}"`;
        if (animation !== undefined) {
            const known = catalog.animations.find((entry: {name: string}) => entry.name.toLowerCase() === animation.name.toLowerCase());
            if (known === undefined)                     return `${path}.animation.name: unknown animation "${animation.name}"`;
            if ((known.kind === "timed") && animation.tuned) return `${path}.animation: strength and hold_ms are only for held animations ("${known.name}" is timed)`;
        }

        // The gaze frame and the prop
        if ((gaze !== undefined) && (gaze !== "release") && !catalog.gazeFrames.includes(gaze.on)) return `${path}.gaze.on: this avatar can't look in the "${gaze.on}" frame`;
        if ((prop?.hold !== undefined) && (prop.hold !== null) && !catalog.props.includes(prop.hold)) return `${path}.prop.hold: this avatar has no "${prop.hold}"`;
    }
    return null;
}

// The setup's resting face, when the avatar has no expression by that name
export function checkSetupNames(setup: AvatarSetup, catalog: PlanCatalog): string | null {
    if ((setup.rest !== null) && !hasName(catalog.expressions, setup.rest)) return `rest: unknown expression "${setup.rest}"`;
    return null;
}

// Whether a list holds a name, ignoring case
function hasName(names: string[], name: string): boolean {
    return names.some((known: string) => known.toLowerCase() === name.toLowerCase());
}


// --------------------------------------------------------------------------------
// Reading a Plan
// --------------------------------------------------------------------------------
// A whole plan, its steps checked in order
function readPlan(data: unknown): AvatarPlan {
    const plan  = readObject(data, "plan", PLAN_KEYS);
    const steps = readList(plan.steps, "steps", 0, PLAN_MAX_STEPS);
    return {
        id        : readName(plan, "id", "", PLAN_MAX_ID_CHARS),
        turn      : readWhole(plan, "turn", "", 0, Number.MAX_SAFE_INTEGER) ?? null,
        feedback  : readChoice(plan, "feedback", "", PLAN_FEEDBACK_MODES) ?? "none",
        expire_ms : readWhole(plan, "expire_ms", "", 0, PLAN_MAX_MS) ?? PLAN_DEFAULT_EXPIRE_MS,
        steps     : steps.map((step: unknown, i: number): PlanStep => readStep(step, `steps[${i}]`)),
    };
}

// One step: its timing (and the rules between its timing fields), then its actions
function readStep(value: unknown, path: string): PlanStep {
    const step = readObject(value, path, [...TIMING_KEYS, ...ACTION_KEYS]);

    // 1) The moment, and the wait after it (negative only where the client can know the moment ahead)
    const startOn = readMoment(step.start_on, `${path}.start_on`);
    const waitMs  = readWhole(step, "wait_ms", path, -PLAN_MAX_MS, PLAN_MAX_MS) ?? 0;
    const onAudio = (startOn === "reply_audio") || (startOn === "reply_end") || (typeof startOn === "object");
    if ((waitMs < 0) && !onAudio) reject(`${path}.wait_ms`, "can only be negative on reply_audio, reply_end, or a sentence");

    // 2) The audio hold, only for a step that wants to start before the reply's first audio
    if (("hold_audio_ms" in step) && !((startOn === "reply_audio") && (waitMs < 0))) reject(`${path}.hold_audio_ms`, "only works on reply_audio with a negative wait_ms");
    const holdAudioMs = readWhole(step, "hold_audio_ms", path, 0, PLAN_MAX_AUDIO_HOLD_MS) ?? 0;

    // 3) Which reply, for a step timed to one
    if (("response_id" in step) && (startOn === "previous")) reject(`${path}.response_id`, "needs a reply moment in start_on");
    const responseId = readWhole(step, "response_id", path, 0, Number.MAX_SAFE_INTEGER) ?? null;

    return {
        start_on      : startOn,
        wait_ms       : waitMs,
        hold_audio_ms : holdAudioMs,
        response_id   : responseId,
        ms            : readWhole(step, "ms", path, 0, PLAN_MAX_MS) ?? null,
        actions       : readActions(step, path),
    };
}

// The moment a step is measured from (left out: the end of the step before)
function readMoment(value: unknown, path: string): PlanMoment {
    if (value === undefined) return "previous";
    if (isOneOf(value, PLAN_MOMENT_NAMES)) return value;
    if (!isRecord(value)) reject(path, `must be one of ${PLAN_MOMENT_NAMES.join(", ")}, or {"sentence": n}`);
    const moment = readObject(value, path, ["sentence"]);
    return {sentence: readRequiredNumber(moment, "sentence", path, 1, PLAN_MAX_SENTENCE, true)};
}

// Every action a step holds (an animation can't share a step with a face or a movement: they move the same parts)
function readActions(step: Record<string, unknown>, path: string): StepActions {
    const actions: StepActions = {};
    if (step.reset !== undefined) {
        if (step.reset !== true) reject(`${path}.reset`, "must be true");
        actions.reset = true;
    }
    if (step.face      !== undefined) actions.face      = readFace     (step.face,      `${path}.face`     );
    if (step.move      !== undefined) actions.move      = readMove     (step.move,      `${path}.move`     );
    if (step.animation !== undefined) actions.animation = readAnimation(step.animation, `${path}.animation`);
    if (step.pose      !== undefined) actions.pose      = readPose     (step.pose,      `${path}.pose`     );
    if (step.gaze      !== undefined) actions.gaze      = readGaze     (step.gaze,      `${path}.gaze`     );
    if (step.prop      !== undefined) actions.prop      = readProp     (step.prop,      `${path}.prop`     );
    if (step.breath    !== undefined) actions.breath    = readBreath   (step.breath,    `${path}.breath`   );
    if (step.blink     !== undefined) actions.blink     = readBlink    (step.blink,     `${path}.blink`    );
    if (step.state     !== undefined) actions.state     = readStateName(step.state,     `${path}.state`    );
    if ((actions.animation !== undefined) && ((actions.face !== undefined) || (actions.move !== undefined))) reject(`${path}.animation`, "can't share a step with face or move");
    return actions;
}


// --------------------------------------------------------------------------------
// Reading Actions
// --------------------------------------------------------------------------------
// An expression to show, or "rest"
function readFace(value: unknown, path: string): FaceAction {
    if (value === "rest") return "rest";
    const face = readObject(value, path, ["name", "strength", "hold_ms", "in_ms", "out_ms"]);
    return {
        name     : readName(face, "name", path, PLAN_MAX_NAME_CHARS),
        strength : readNumber(face, "strength", path, 0, 1) ?? 1,
        hold_ms  : readNullableWhole(face, "hold_ms", path, 0, PLAN_MAX_MS) ?? null,
        in_ms    : readWhole(face, "in_ms",  path, 0, PLAN_MAX_TRANSITION_MS) ?? null,
        out_ms   : readWhole(face, "out_ms", path, 0, PLAN_MAX_TRANSITION_MS) ?? null,
    };
}

// A movement to play once
function readMove(value: unknown, path: string): MoveAction {
    const move = readObject(value, path, ["name", "strength", "speed"]);
    return {
        name     : readName(move, "name", path, PLAN_MAX_NAME_CHARS),
        strength : readNumber(move, "strength", path, 0, 1) ?? 1,
        speed    : readNumber(move, "speed", path, PLAN_MOVE_SPEED_RANGE[0], PLAN_MOVE_SPEED_RANGE[1]) ?? 1,
    };
}

// An animation to play (its strength and hold apply only to held ones, which `checkPlanNames` confirms)
function readAnimation(value: unknown, path: string): AnimationAction {
    const animation = readObject(value, path, ["name", "strength", "hold_ms"]);
    return {
        name     : readName(animation, "name", path, PLAN_MAX_NAME_CHARS),
        strength : readNumber(animation, "strength", path, 0, 1) ?? 1,
        hold_ms  : readNullableWhole(animation, "hold_ms", path, 0, PLAN_MAX_MS) ?? null,
        tuned    : ("strength" in animation) || ("hold_ms" in animation),
    };
}

// A head pose to hold, or "rest"
function readPose(value: unknown, path: string): PoseAction {
    if (value === "rest") return "rest";
    const pose = readObject(value, path, ["turn", "tilt", "move_ms", "hold_ms"]);
    return {
        turn    : (pose.turn === undefined) ? [0, 0] : readPoint(pose.turn, `${path}.turn`, -1, 1),
        tilt    : readNumber(pose, "tilt", path, -PLAN_POSE_TILT_DEG, PLAN_POSE_TILT_DEG) ?? 0,
        move_ms : readWhole(pose, "move_ms", path, 0, PLAN_MAX_TRANSITION_MS) ?? null,
        hold_ms : readNullableWhole(pose, "hold_ms", path, 0, PLAN_MAX_MS) ?? null,
    };
}

// Where the eyes go: a point, a scan, or a trace in one frame, or "release" (only one of `at`, `offset`, `scan`, `trace`)
function readGaze(value: unknown, path: string): GazeAction {
    if (value === "release") return "release";
    const gaze  = readObject(value, path, ["on", "at", "offset", "scan", "trace", "speed", "head", "hold_ms"]);
    const on    = readRequiredChoice(gaze, "on", path, GAZE_FRAMES);
    const modes = ["at", "offset", "scan", "trace"].filter((key: string) => key in gaze);
    if (modes.length > 1) reject(path, `can hold only one of at, offset, scan, trace (it has ${modes.join(", ")})`);

    // Points run 0 to 1 on the map and -1 to 1 elsewhere
    const [low, high] = (on === "map") ? [0, 1] : [-1, 1];
    let look: GazeLook;
    if (gaze.at !== undefined) {
        if (on === "user") reject(`${path}.at`, "use offset to look away from the user");
        look = {kind: "point", at: readPoint(gaze.at, `${path}.at`, low, high)};
    }
    else if (gaze.offset !== undefined) {
        if (on !== "user") reject(`${path}.offset`, "only works with on: user");
        look = {kind: "point", at: readPoint(gaze.offset, `${path}.offset`, -1, 1)};
    }
    else if (gaze.scan  !== undefined) { look = readScan(gaze.scan, `${path}.scan`, on, low, high); }
    else if (gaze.trace !== undefined) { look = {kind: "trace", path: readPath(gaze.trace, `${path}.trace`, low, high), speed: readNumber(gaze, "speed", path, PLAN_TRACE_SPEED_RANGE[0], PLAN_TRACE_SPEED_RANGE[1]) ?? null}; }
    else if (on === "user")            { look = {kind: "point", at: [0, 0]}; }
    else                               { reject(path, `needs at, scan, or trace on the ${on}`); }
    if ((gaze.speed !== undefined) && (look.kind !== "trace")) reject(`${path}.speed`, "only works with trace");

    return {on, look, head: readNumber(gaze, "head", path, 0, 1) ?? null, hold_ms: readNullableWhole(gaze, "hold_ms", path, 0, PLAN_MAX_MS) ?? null};
}

// Fixations at random points in a circle (its center in the frame's range)
function readScan(value: unknown, path: string, on: GazeFrame, low: number, high: number): GazeLook {
    const scan  = readObject(value, path, ["around", "radius", "fix_ms"]);
    const fixMs = (scan.fix_ms === undefined) ? null : readPoint(scan.fix_ms, `${path}.fix_ms`, PLAN_SCAN_FIX_MS_RANGE[0], PLAN_SCAN_FIX_MS_RANGE[1]);
    if ((fixMs !== null) && (fixMs[0] > fixMs[1])) reject(`${path}.fix_ms`, "must be [shortest, longest]");
    return {
        kind   : "scan",
        around : readPoint(scan.around, `${path}.around`, low, high),
        radius : readRequiredNumber(scan, "radius", path, 0, (on === "map") ? PLAN_SCAN_MAX_RADIUS.map : PLAN_SCAN_MAX_RADIUS.other),
        fix_ms : fixMs,
    };
}

// A trace's path: 2 to 64 points in the frame's range
function readPath(value: unknown, path: string, low: number, high: number): PlanPoint[] {
    return readList(value, path, 2, PLAN_MAX_PATH_POINTS).map((point: unknown, i: number): PlanPoint => readPoint(point, `${path}[${i}]`, low, high));
}

// The held prop: picked up, put away, raised, or lowered (at least one of `hold` and `raise`)
function readProp(value: unknown, path: string): PropAction {
    const prop = readObject(value, path, ["hold", "raise", "move_ms"]);
    if ((prop.hold === undefined) && (prop.raise === undefined)) reject(path, "needs hold or raise");
    const action: PropAction = {raise: readNumber(prop, "raise", path, 0, 1) ?? null, move_ms: readWhole(prop, "move_ms", path, 0, PLAN_MAX_TRANSITION_MS) ?? null};
    if (prop.hold !== undefined) action.hold = (prop.hold === null) ? null : readRequiredChoice(prop, "hold", path, PROP_NAMES);
    return action;
}

// One deliberate breath
function readBreath(value: unknown, path: string): BreathAction {
    const breath = readObject(value, path, ["in_ms", "depth", "hold_ms", "out_ms"]);
    return {
        in_ms   : readRequiredNumber(breath, "in_ms", path, PLAN_BREATH_IN_MS_RANGE[0], PLAN_BREATH_IN_MS_RANGE[1], true),
        depth   : readNumber(breath, "depth", path, PLAN_BREATH_DEPTH_RANGE[0], PLAN_BREATH_DEPTH_RANGE[1]) ?? null,
        hold_ms : readNullableWhole(breath, "hold_ms", path, 0, PLAN_MAX_TRANSITION_MS) ?? null,
        out_ms  : readWhole(breath, "out_ms", path, PLAN_BREATH_OUTMS_RANGE[0], PLAN_BREATH_OUTMS_RANGE[1]) ?? null,
    };
}

// One blink: `true`, or `{"ms"}`
function readBlink(value: unknown, path: string): BlinkAction {
    if (value === true) return {ms: null};
    const blink = readObject(value, path, ["ms"]);
    return {ms: readRequiredNumber(blink, "ms", path, PLAN_BLINK_MS_RANGE[0], PLAN_BLINK_MS_RANGE[1], true)};
}

// A conversation state the backend may set
function readStateName(value: unknown, path: string): PlanState {
    if (!isOneOf(value, PLAN_STATES)) reject(path, `must be one of ${PLAN_STATES.join(", ")} (the client sets "speaking" itself)`);
    return value;
}


// --------------------------------------------------------------------------------
// Reading a Setup
// --------------------------------------------------------------------------------
// Session settings, each automatic behavior left out taking its default
function readSetup(data: unknown): AvatarSetup {
    const setup = readObject(data, "setup", SETUP_KEYS);
    const auto: Record<string, unknown> = (setup.auto === undefined) ? {} : readObject(setup.auto, "auto", AUTO_BEHAVIORS);
    return {
        rest : (setup.rest === undefined) ? null : readName(setup, "rest", "", PLAN_MAX_NAME_CHARS),
        auto : {
            idle_glances      : readBoolean(auto, "idle_glances",      "auto") ?? SETUP_DEFAULT_AUTO.idle_glances,
            thinking_look     : readBoolean(auto, "thinking_look",     "auto") ?? SETUP_DEFAULT_AUTO.thinking_look,
            speech_gaze       : readBoolean(auto, "speech_gaze",       "auto") ?? SETUP_DEFAULT_AUTO.speech_gaze,
            listening_motions : readBoolean(auto, "listening_motions", "auto") ?? SETUP_DEFAULT_AUTO.listening_motions,
        },
    };
}


// --------------------------------------------------------------------------------
// Field Readers
// --------------------------------------------------------------------------------
// A frame that fails a check (thrown by the readers, and turned into a rejection once, in `parseFrame`)
class FrameRejection extends Error {}

// Reject the frame, naming the field and what is wrong with it
function reject(path: string, problem: string): never {
    throw new FrameRejection(`${path}: ${problem}`);
}

// A field's path inside its parent ("" is the frame itself)
function fieldPath(path: string, key: string): string {
    return (path === "") ? key : `${path}.${key}`;
}

// Whether a value is a plain JSON object
function isRecord(value: unknown): value is Record<string, unknown> {
    return (typeof value === "object") && (value !== null) && !Array.isArray(value);
}

// Whether a value is one of a fixed set of strings
function isOneOf<T extends string>(value: unknown, choices: readonly T[]): value is T {
    return choices.some((choice: T) => choice === value);
}

// A JSON object with no fields beyond the allowed ones
function readObject(value: unknown, path: string, allowed: readonly string[]): Record<string, unknown> {
    if (!isRecord(value)) reject(path, "must be an object");
    const extra = Object.keys(value).find((key: string) => !allowed.includes(key));
    if (extra !== undefined) reject(fieldPath(path, extra), "is not a known field");
    return value;
}

// A list of `min` to `max` items (each checked by the caller)
function readList(value: unknown, path: string, min: number, max: number): unknown[] {
    if (!Array.isArray(value)) reject(path, "must be a list");
    const list: unknown[] = value;
    if ((list.length < min) || (list.length > max)) reject(path, `must have ${min} to ${max} items`);
    return list;
}

// An [x, y] pair, each from `low` to `high`
function readPoint(value: unknown, path: string, low: number, high: number): PlanPoint {
    if (!Array.isArray(value) || (value.length !== 2)) reject(path, "must be an [x, y] pair");
    const pair   : unknown[] = value;
    const coords = pair.map((coord: unknown, i: number): number => {
        if ((typeof coord !== "number") || !Number.isFinite(coord)) reject(`${path}[${i}]`, "must be a number");
        if ((coord < low) || (coord > high))                         reject(`${path}[${i}]`, `must be from ${low} to ${high}`);
        return coord;
    });
    return [coords[0], coords[1]];
}

// A number from `low` to `high` (a whole number when `whole`), or undefined when left out
function readNumber(record: Record<string, unknown>, key: string, path: string, low: number, high: number, whole: boolean = false): number | undefined {
    const value = record[key];
    if (value === undefined) return undefined;
    if ((typeof value !== "number") || !Number.isFinite(value) || (whole && !Number.isInteger(value))) reject(fieldPath(path, key), whole ? "must be a whole number" : "must be a number");
    if ((value < low) || (value > high)) reject(fieldPath(path, key), `must be from ${low} to ${high}`);
    return value;
}

// A required number from `low` to `high` (a whole number when `whole`)
function readRequiredNumber(record: Record<string, unknown>, key: string, path: string, low: number, high: number, whole: boolean = false): number {
    const value = readNumber(record, key, path, low, high, whole);
    if (value === undefined) reject(fieldPath(path, key), "is required");
    return value;
}

// A whole number from `low` to `high`, or undefined when left out
function readWhole(record: Record<string, unknown>, key: string, path: string, low: number, high: number): number | undefined {
    return readNumber(record, key, path, low, high, true);
}

// A whole number that may also be null ("until replaced"), or undefined when left out
function readNullableWhole(record: Record<string, unknown>, key: string, path: string, low: number, high: number): number | null | undefined {
    return (record[key] === null) ? null : readWhole(record, key, path, low, high);
}

// A required string of 1 to `maxChars` characters
function readName(record: Record<string, unknown>, key: string, path: string, maxChars: number): string {
    const value = record[key];
    if (typeof value !== "string")                         reject(fieldPath(path, key), "must be a string");
    if ((value.length === 0) || (value.length > maxChars)) reject(fieldPath(path, key), `must be 1 to ${maxChars} characters`);
    return value;
}

// true or false, or undefined when left out
function readBoolean(record: Record<string, unknown>, key: string, path: string): boolean | undefined {
    const value = record[key];
    if (value === undefined) return undefined;
    if (typeof value !== "boolean") reject(fieldPath(path, key), "must be true or false");
    return value;
}

// One of a fixed set of strings, or undefined when left out
function readChoice<T extends string>(record: Record<string, unknown>, key: string, path: string, choices: readonly T[]): T | undefined {
    const value = record[key];
    if (value === undefined) return undefined;
    if (!isOneOf(value, choices)) reject(fieldPath(path, key), `must be one of ${choices.join(", ")}`);
    return value;
}

// One of a fixed set of strings, required
function readRequiredChoice<T extends string>(record: Record<string, unknown>, key: string, path: string, choices: readonly T[]): T {
    const value = readChoice(record, key, path, choices);
    if (value === undefined) reject(fieldPath(path, key), "is required");
    return value;
}
