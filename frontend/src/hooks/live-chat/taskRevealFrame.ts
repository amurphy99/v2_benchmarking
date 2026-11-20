/* The task's reveal as a chat ends (`task_reveal`), checked on arrival.
--------------------------------------------------------------------------------
`@frontend/src/hooks/live-chat/taskRevealFrame`

A task chat type sends one just before the backend closes the socket, on either
normal end (`backend/chat_app/websocket/consumers/HARNESS_PROTOCOL.md` §14): the
avatar's Map Task map and the path it took, the avatar's side of the planning
task, or the threads a speech elicitation chat followed. `kind` says which. This
page drops any other kind, or a reveal that doesn't match its shape. Field names
keep the wire's spelling.

*/
// From this project
import type { ElicitationThread, ElicitationThreadReply, MapPoint, MapTaskFollowerMap } from "@/api";
import      { parseFollowerMap, readPoints                                           } from "@/components/map_task/mapTaskViews";

// What a reply on a thread can have done (copied from `ThreadReply` in `backend/chat_app/websocket/harnesses/speech_elicitation/harness.py`)
const ELICITATION_THREAD_REPLIES: readonly ElicitationThreadReply[] = ["follow_up", "share", "challenge", "wind_down", "fallback"];


// --------------------------------------------------------------------------------
// Reveal Types
// --------------------------------------------------------------------------------
// The avatar's Map Task map, and the path it took on it (every committed waypoint, from the start)
export type MapTaskReveal = {kind: "map_task"; path: MapPoint[]} & MapTaskFollowerMap;

// One of the avatar's planning constraints, and whether it brought it up during the chat
export type PlanningRevealConstraint = {text: string; mentioned: boolean};

// The avatar's side of the planning task: its brief and its constraints, worded to it
export type PlanningReveal = {kind: "cooperative_planning"; brief: string; constraints: PlanningRevealConstraint[]};

// Every thread a speech elicitation chat followed, in order
export type ElicitationReveal = {kind: "speech_elicitation"; threads: ElicitationThread[]};

// Every kind of reveal this page can show
export type TaskReveal = MapTaskReveal | PlanningReveal | ElicitationReveal;


// ================================================================================
// Parse a Task Reveal
// ================================================================================
// A `task_reveal` frame's data (null for a kind this page can't show, or a malformed reveal)
export function parseTaskReveal(data: unknown): TaskReveal | null {
    if (!isRecord(data)) return null;
    if (data.kind === "map_task")             return parseMapReveal(data);
    if (data.kind === "cooperative_planning") return parsePlanningReveal(data);
    if (data.kind === "speech_elicitation")   return parseElicitationReveal(data);
    return null;
}

// The avatar's map and its path, which starts at the start (null when malformed)
function parseMapReveal(data: Record<string, unknown>): MapTaskReveal | null {
    const map  = parseFollowerMap(data);
    const path = readPoints(data.path);
    if ((map === null) || (path === null) || (path.length === 0)) return null;
    return {kind: "map_task", ...map, path};
}

// The avatar's brief and constraints (null when malformed)
function parsePlanningReveal(data: Record<string, unknown>): PlanningReveal | null {
    const {brief, constraints} = data;
    if ((typeof brief !== "string") || !Array.isArray(constraints)) return null;

    // Every constraint must be well formed
    const lines = constraints.map(readConstraint);
    if (!lines.every((line: PlanningRevealConstraint | null): line is PlanningRevealConstraint => line !== null)) return null;
    return {kind: "cooperative_planning", brief, constraints: lines};
}

// Every thread (null when any is malformed)
function parseElicitationReveal(data: Record<string, unknown>): ElicitationReveal | null {
    if (!Array.isArray(data.threads)) return null;
    const threads = data.threads.map(readThread);
    if (!threads.every((thread: ElicitationThread | null): thread is ElicitationThread => thread !== null)) return null;
    return {kind: "speech_elicitation", threads};
}


// --------------------------------------------------------------------------------
// Field Checks
// --------------------------------------------------------------------------------
// One of the avatar's constraints (null when malformed)
function readConstraint(value: unknown): PlanningRevealConstraint | null {
    if (!isRecord(value) || (typeof value.text !== "string") || (typeof value.mentioned !== "boolean")) return null;
    return {text: value.text, mentioned: value.mentioned};
}

// One thread: its question, and what each reply on it did (null when malformed)
function readThread(value: unknown): ElicitationThread | null {
    if (!isRecord(value) || (typeof value.question !== "string") || !Array.isArray(value.replies) || !value.replies.every(isThreadReply)) return null;
    return {question: value.question, replies: value.replies};
}

// One of the things a reply on a thread can have done
function isThreadReply(value: unknown): value is ElicitationThreadReply {
    return ELICITATION_THREAD_REPLIES.some((reply: ElicitationThreadReply) => reply === value);
}

// A plain JSON object
function isRecord(value: unknown): value is Record<string, unknown> {
    return (typeof value === "object") && (value !== null) && !Array.isArray(value);
}
