/* Example plans for the demo: behavior chains as the backend will send them.
--------------------------------------------------------------------------------
`@frontend/src/pages/avatar_demo/utils/planExamples`

Each example is a short list of `avatar_setup` and `avatar_plan` frames
(`pages/common/avatar/AVATAR_PLANS.md`), sent at set times after its button is
clicked (`usePlanExamples`). Every one uses something only plans can do: chains
of steps, looks at the screen or the map, scans and traces, held head poses,
faces at a strength, steps timed to a reply (its first audio, a sentence, its
end, or just before it starts), and a newer plan cutting an older one short.
An example with a reply simulates one: its text arrives at `textAtMs` (after
any frames sent then), and the sample reply's audio follows.

The Map Task examples each start the way a Map Task chat does: a setup (the
backend owns the conversation state; the listening sway, head cock, and
thinking look are off), then the avatar picks up its map. Their spots are on
the demo's made-up map (`sampleMap`).

*/
import type { PlanPoint                          } from "@/hooks/live-chat/avatarPlanFrames";
import      { DEMO_MAP_LANDMARKS, DEMO_MAP_START } from "./sampleMap";


// --------------------------------------------------------------------------------
// Example Types
// --------------------------------------------------------------------------------
// One frame the simulated backend sends, `atMs` after the click (a plan gets its `turn` when sent)
export type ExampleFrame =
    | {atMs: number; type: "avatar_setup"; data: Record<string, unknown>}
    | {atMs: number; type: "avatar_plan";  data: {id: string; feedback: "end"; steps: Record<string, unknown>[]}};

// One example
export type PlanExample = {
    name   : string;                      // Its button
    blurb  : string;                      // What it shows (the button's tooltip)
    frames : ExampleFrame[];
    reply  : {textAtMs: number} | null;   // The reply it simulates (null for none)
};

// A plan frame (every example asks to hear when each plan ends, for the demo's log)
function plan(atMs: number, id: string, steps: Record<string, unknown>[]): ExampleFrame {
    return {atMs, type: "avatar_plan", data: {id, feedback: "end", steps}};
}


// ================================================================================
// General Examples
// ================================================================================
// Chains on the face alone (no map): sequences, scans, poses, strengths, and reply timing
export const DEMO_PLAN_EXAMPLES: PlanExample[] = [
    {
        name   : "Look Away and Back",
        blurb  : "Looks up and away for 0.7 s, back at the user, then blinks: two steps in a chain.",
        reply  : null,
        frames : [plan(0, "look-away", [
            {gaze: {on: "user", offset: [0.55, -0.45], hold_ms: 700}},
            {blink: true},
        ])],
    },
    {
        name   : "Puzzle It Out",
        blurb  : "A partial furrow while its eyes search around, then an \"aha\": wide eyes, a blink, and a small nod.",
        reply  : null,
        frames : [plan(0, "puzzle", [
            {face: {name: "Furrowed Brow", strength: 0.6}, gaze: {on: "user", scan: {around: [0, 0.1], radius: 0.35, fix_ms: [300, 500]}, hold_ms: 1_800}},
            {face: {name: "Wide-Eyed", strength: 0.8, hold_ms: 700}, gaze: {on: "user"}, blink: true, ms: 150},
            {move: {name: "Nod", strength: 0.6}},
            {gaze: "release"},
        ])],
    },
    {
        name   : "Z Look",
        blurb  : "Its eyes trace a Z across the screen, one corner every 0.35 s, then it blinks.",
        reply  : null,
        frames : [plan(0, "z-look", [
            {gaze: {on: "screen", at: [-0.6, -0.5]}, ms: 350},
            {gaze: {on: "screen", at: [ 0.6, -0.5]}, ms: 350},
            {gaze: {on: "screen", at: [-0.6,  0.5]}, ms: 350},
            {gaze: {on: "screen", at: [ 0.6,  0.5]}, ms: 350},
            {gaze: "release", blink: true},
        ])],
    },
    {
        name   : "Lean In",
        blurb  : "Tips its head down and to one side with a slight squint for 1.6 s, eases back, and gives a small, quick nod.",
        reply  : null,
        frames : [plan(0, "lean-in", [
            {pose: {turn: [0, 0.15], tilt: -8, move_ms: 500, hold_ms: 1_600}, face: {name: "Squinting Face", strength: 0.5, hold_ms: 1_600, in_ms: 400}},
            {move: {name: "Nod", strength: 0.4, speed: 1.3}},
        ])],
    },
    {
        name   : "Turn-Yielding Reply",
        blurb  : "With the sample reply: looks away 0.4 s into it, aside as sentence 2 starts, and back at the user 0.4 s before the end.",
        reply  : {textAtMs: 300},
        frames : [plan(300, "turn-yield", [
            {start_on: "reply_audio", wait_ms: 400, gaze: {on: "user", offset: [0.55, -0.45], hold_ms: 800}, ms: 0},
            {start_on: {sentence: 2}, gaze: {on: "user", offset: [-0.5, 0.2], hold_ms: 700}, ms: 0},
            {start_on: "reply_end", wait_ms: -400, gaze: {on: "user", hold_ms: 1_500}, blink: true},
        ])],
    },
    {
        name   : "Breath Before Speaking",
        blurb  : "With the sample reply: a breath that starts 0.6 s before the voice (the reply's audio waits up to 0.4 s for it), and a smile as it starts talking.",
        reply  : {textAtMs: 300},
        frames : [plan(300, "breath", [
            {start_on: "reply_audio", wait_ms: -600, hold_audio_ms: 400, breath: {in_ms: 550, depth: 0.03, hold_ms: null}},
            {start_on: "reply_audio", face: {name: "Smiling Face", hold_ms: 1_500}},
        ])],
    },
];


// --------------------------------------------------------------------------------
// Map Task Examples
// --------------------------------------------------------------------------------
// The Map Task chat's setup, sent first by every map example
const DEMO_MAP_SETUP: ExampleFrame = {atMs: 0, type: "avatar_setup", data: {auto: {idle_glances: true, thinking_look: false, speech_gaze: false, listening_motions: false}}};

// Search the raised map with a slight furrow, thinking (until the answer's plan takes over)
function mapSearch(id: string, scan: {radius: number; fix_ms?: [number, number]}, laterSteps: Record<string, unknown>[] = []): ExampleFrame {
    return plan(0, id, [
        {prop: {hold: "map", raise: 1}, state: "thinking", face: {name: "Furrowed Brow", strength: 0.5}, gaze: {on: "map", scan: {around: [0.5, 0.5], ...scan}}},
        ...laterSteps,
    ]);
}

// End an answer: lower the map and look up a moment into the reply, and listen once it ends
function lowerIntoReply(afterMs: number): Record<string, unknown>[] {
    return [
        {start_on: "reply_audio", wait_ms: afterMs, prop: {raise: 0}, gaze: {on: "user", hold_ms: 1_500}},
        {start_on: "reply_end", state: "listening"},
    ];
}

// Every map example (each picks up the map itself)
export const DEMO_MAP_EXAMPLES: PlanExample[] = [
    {
        name   : "Do You Have a Bridge?",
        blurb  : "Raises the map and searches it, locks onto the bridge (its top left, so your right), widens its eyes, and lowers the map 0.3 s into the reply.",
        reply  : {textAtMs: 1_400},
        frames : [DEMO_MAP_SETUP, mapSearch("bridge-search", {radius: 0.45}), plan(1_400, "bridge-found", [
            {gaze: {on: "map", at: DEMO_MAP_LANDMARKS.bridge.at}, ms: 350},
            {face: {name: "Wide-Eyed", strength: 0.7, hold_ms: 400}},
            ...lowerIntoReply(300),
        ])],
    },
    {
        name   : "Go Right to the Bus",
        blurb  : "Raises the map with its eyes on its own spot, traces its way right to the bus while the reply is made, and lowers the map 0.2 s into the reply.",
        reply  : {textAtMs: 2_000},
        frames : [DEMO_MAP_SETUP, plan(0, "bus-start", [{prop: {hold: "map", raise: 1}, state: "thinking", gaze: {on: "map", at: DEMO_MAP_START}}]), plan(1_000, "bus-trace", [
            {gaze: {on: "map", trace: [DEMO_MAP_START, [0.52, 0.68] satisfies PlanPoint, DEMO_MAP_LANDMARKS.bus.at], speed: 0.35, hold_ms: 400}},
            ...lowerIntoReply(200),
        ])],
    },
    {
        name   : "Is There a Castle?",
        blurb  : "There's no castle on its map: a wide search, a quicker last sweep, a small head shake, and the map comes down as the reply starts.",
        reply  : {textAtMs: 2_800},
        frames : [DEMO_MAP_SETUP, mapSearch("castle-search", {radius: 0.5, fix_ms: [200, 300]}), plan(1_600, "castle-none", [
            {gaze: {on: "map", scan: {around: [0.5, 0.5], radius: 0.5, fix_ms: [180, 260]}, hold_ms: 700}},
            {move: {name: "Shake No", strength: 0.6}, face: "rest"},
            {start_on: "reply_audio", prop: {raise: 0}, gaze: "release"},
            {start_on: "reply_end", state: "listening"},
        ])],
    },
    {
        name   : "Barge-In",
        blurb  : "It starts searching, but 1.3 s in the user talks again: a newer plan resets it, lowers the map, and listens (the search plan's waiting step is cancelled).",
        reply  : null,
        frames : [DEMO_MAP_SETUP, mapSearch("barge-search", {radius: 0.45}, [{start_on: "reply_audio", wait_ms: 300, prop: {raise: 0}}]), plan(1_300, "barge-in", [
            {reset: true, prop: {raise: 0}, state: "listening"},
        ])],
    },
    {
        name   : "Z Across the Map",
        blurb  : "Raises the map and runs its eyes in a Z across it: its top left to top right, then bottom left to bottom right (mirrored on screen).",
        reply  : null,
        frames : [DEMO_MAP_SETUP, plan(0, "map-z", [
            {prop: {hold: "map", raise: 1}, state: "thinking"},
            {gaze: {on: "map", at: [0.1, 0.1]}, ms: 320},
            {gaze: {on: "map", at: [0.9, 0.1]}, ms: 320},
            {gaze: {on: "map", at: [0.1, 0.9]}, ms: 320},
            {gaze: {on: "map", at: [0.9, 0.9]}, ms: 320},
            {gaze: "release", prop: {raise: 0}, state: "listening"},
        ])],
    },
    {
        name   : "Glance at the Map",
        blurb  : "While listening, a glance down at its spot on the lowered map, and back up at the user.",
        reply  : null,
        frames : [DEMO_MAP_SETUP, plan(0, "map-glance", [
            {prop: {hold: "map"}, state: "listening", ms: 800},
            {gaze: {on: "map", at: DEMO_MAP_START, hold_ms: 700}},
        ])],
    },
];

// The map by hand: picked up (with the Map Task setup), put away, raised, and lowered
export const DEMO_MAP_CONTROLS = {
    hold    : {name: "Hold the Map",     blurb: "Takes the Map Task setup, picks up the map, and listens.", reply: null, frames: [DEMO_MAP_SETUP, plan(0, "map-hold", [{prop: {hold: "map"}, state: "listening"}])]},
    putAway : {name: "Put the Map Away", blurb: "Puts the map away (the page clears the setup too).",        reply: null, frames: [plan(0, "map-away",  [{prop: {hold: null}}])]},
    raise   : {name: "Raise the Map",    blurb: "Raises the map until its eyes peek over it.",              reply: null, frames: [plan(0, "map-raise", [{prop: {raise: 1}}])]},
    lower   : {name: "Lower the Map",    blurb: "Lowers the map to its chin.",                              reply: null, frames: [plan(0, "map-lower", [{prop: {raise: 0}}])]},
} satisfies Record<string, PlanExample>;
