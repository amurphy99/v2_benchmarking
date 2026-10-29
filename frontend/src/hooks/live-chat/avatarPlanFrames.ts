/* Avatar plan frames: setup, plan, and feedback, as the client runs them.
--------------------------------------------------------------------------------
`@frontend/src/hooks/live-chat/avatarPlanFrames`

The backend drives a capable avatar with three frames, specified in
`pages/common/avatar/AVATAR_PLANS.md` (a draft that will move into
`CLIENT_PROTOCOL.md`): `avatar_setup` (session settings), `avatar_plan` (steps
that run in order on the client's clock), and `avatar_feedback` (what happened,
sent back). These types mirror that wire format as the client runs it: field
names keep the wire's spelling, the protocol's own defaults are filled in, and a
timing an avatar tunes for itself (how fast a face moves in, a breath's depth)
stays null when the plan leaves it out.

Frames are checked where they arrive (`avatarPlanChecks`).

*/
// Every fixed vocabulary in the frames
export const PLAN_FEEDBACK_MODES = ["none", "end", "steps"] as const;
export const PLAN_MOMENT_NAMES   = ["previous", "reply_text", "reply_audio", "reply_end"] as const;
export const PLAN_STATES         = ["idle", "listening", "thinking"] as const;
export const GAZE_FRAMES         = ["user", "screen", "map"] as const;
export const PROP_NAMES          = ["map"] as const;
export const AUTO_BEHAVIORS      = ["idle_glances", "thinking_look", "speech_gaze", "listening_motions"] as const;


// --------------------------------------------------------------------------------
// Plan Types
// --------------------------------------------------------------------------------
// The vocabularies, as types
export type PlanFeedbackMode = typeof PLAN_FEEDBACK_MODES[number];
export type PlanState        = typeof PLAN_STATES[number];
export type GazeFrame        = typeof GAZE_FRAMES[number];
export type PropName         = typeof PROP_NAMES[number];

// An [x, y] pair (`AVATAR_PLANS.md` §8)
export type PlanPoint = [number, number];

// The moment a step is measured from
export type PlanMoment = typeof PLAN_MOMENT_NAMES[number] | {sentence: number};

// One action of each kind (null leaves a timing to the avatar's own default)
export type FaceAction      = "rest" | {name: string; strength: number; hold_ms: number | null; in_ms: number | null; out_ms: number | null};
export type MoveAction      = {name: string; strength: number; speed: number};
export type AnimationAction = {name: string; strength: number; hold_ms: number | null; tuned: boolean};   // `tuned`: strength or hold_ms was given (held Animations only)
export type PoseAction      = "rest" | {turn: PlanPoint; tilt: number; move_ms: number | null; hold_ms: number | null};
export type PropAction      = {hold?: PropName | null; raise: number | null; move_ms: number | null};      // `hold` left out keeps the prop in hand; null `raise` keeps its height
export type BreathAction    = {in_ms: number; depth: number | null; hold_ms: number | null; out_ms: number | null};
export type BlinkAction     = {ms: number | null};

// Where a gaze goes in its frame: one point (`at`, or a user `offset`), a scan around a point, or a trace along a path
export type GazeLook =
    | {kind: "point"; at: PlanPoint}
    | {kind: "scan";  around: PlanPoint; radius: number; fix_ms: [number, number] | null}
    | {kind: "trace"; path: PlanPoint[]; speed: number | null};
export type GazeAction = "release" | {on: GazeFrame; look: GazeLook; head: number | null; hold_ms: number | null};

// Everything one step does at once (`reset` runs first)
export type StepActions = {
    reset?     : true;
    face?      : FaceAction;
    move?      : MoveAction;
    animation? : AnimationAction;
    pose?      : PoseAction;
    gaze?      : GazeAction;
    prop?      : PropAction;
    breath?    : BreathAction;
    blink?     : BlinkAction;
    state?     : PlanState;
};

// One step: when it starts, how long it lasts, and what it does
export type PlanStep = {
    start_on      : PlanMoment;
    wait_ms       : number;           // After the moment (negative only for audio moments)
    hold_audio_ms : number;           // Most the reply's audio may wait for this step's lead (0 never delays it)
    response_id   : number | null;    // The reply its moment belongs to (null: the plan's reply)
    ms            : number | null;    // How long it lasts (null: its actions' natural length)
    actions       : StepActions;
};

// One plan
export type AvatarPlan = {
    id        : string;
    turn      : number | null;
    feedback  : PlanFeedbackMode;
    expire_ms : number;
    steps     : PlanStep[];
};


// --------------------------------------------------------------------------------
// Setup, Feedback, and Catalog Types
// --------------------------------------------------------------------------------
// The automatic behaviors a setup switches on or off
export type AutoBehaviors = Record<typeof AUTO_BEHAVIORS[number], boolean>;

// Session settings (a null `rest` keeps the avatar's own default resting face)
export type AvatarSetup = {rest: string | null; auto: AutoBehaviors};

// One event sent back about a plan (or a rejected setup, with a null `id`)
export type PlanFeedbackEvent =
    | {event: "rejected"; reason: string}
    | {event: "started"}
    | {event: "step";    step: number; late_ms: number; reply_ms?: number}
    | {event: "dropped"; step: number; reason: "expired" | "no such sentence"}
    | {event: "ended";   how: "finished" | "cancelled"};
export type AvatarFeedback = PlanFeedbackEvent & {id: string | null; turn?: number};

// What an avatar can run: its names by category (matched ignoring case), its props, and its gaze frames
export type PlanCatalog = {
    expressions : string[];
    movements   : string[];
    animations  : {name: string; kind: "held" | "timed"}[];
    props       : PropName[];
    gazeFrames  : GazeFrame[];
};


// The frame that carries one feedback event back to the backend
export function avatarFeedbackFrame(feedback: AvatarFeedback): {type: "avatar_feedback"; data: AvatarFeedback} {
    return {type: "avatar_feedback", data: feedback};
}
