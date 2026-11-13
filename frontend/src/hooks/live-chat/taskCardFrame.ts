/* The participant's task card (`task_card`), checked where the frame arrives.
--------------------------------------------------------------------------------
`@frontend/src/hooks/live-chat/taskCardFrame`

Some chat types show the participant their task materials beside the avatar
(`backend/chat_app/websocket/consumers/HARNESS_PROTOCOL.md` §13). Each card
replaces the last. `kind` says which chat type's card it is: this page shows
`cooperative_planning` cards and `map_task` maps, and drops any other kind, or a
card that doesn't match its shape. Field names keep the wire's spelling.

*/
// From this project
import type { MapTaskGiverMap } from "@/api";
import      { parseGiverMap   } from "@/components/map_task/mapTaskViews";

// One item's line on a planning card
export type PlanningCardItem = {
    id      : string;          // Item id ("starter")
    label   : string;          // What the line is labeled ("Starter")
    value   : string | null;   // The agreed choice, written on the line (null while open)
    pending : string | null;   // A choice one side asked to settle on, waiting for the other side's yes
};

// A cooperative planning card: the participant's brief and constraints, then a line per item
export type PlanningCard = {
    kind        : "cooperative_planning";
    title       : string;               // The card's heading
    brief       : string;               // Who the participant is and the situation (the avatar never sees this)
    constraints : string[];             // The participant's own constraints (the avatar never sees these)
    items       : PlanningCardItem[];   // One line per item, in order
    complete    : boolean;              // The whole plan was approved
};

// The participant's Map Task map: its landmarks, and the route from the start to the finish
export type MapTaskCard = {kind: "map_task"} & MapTaskGiverMap;

// Every kind of card this page can show
export type TaskCard = PlanningCard | MapTaskCard;


// --------------------------------------------------------------------------------
// Parse a Task Card
// --------------------------------------------------------------------------------
// A `task_card` frame's data as a card (null for a kind this page can't show, or a malformed card)
export function parseTaskCard(data: unknown): TaskCard | null {
    if (!isRecord(data)) return null;
    if (data.kind === "cooperative_planning") return parsePlanningCard(data);
    if (data.kind === "map_task")             return parseMapCard(data);
    return null;
}

// The participant's Map Task map (null when malformed)
function parseMapCard(data: Record<string, unknown>): MapTaskCard | null {
    const map = parseGiverMap(data);
    return (map === null) ? null : {kind: "map_task", ...map};
}

// A cooperative planning card (null when malformed)
function parsePlanningCard(data: Record<string, unknown>): PlanningCard | null {
    const {title, brief, constraints, items, complete} = data;
    if ((typeof title !== "string") || (typeof brief !== "string") || !isStringList(constraints) || !Array.isArray(items) || (typeof complete !== "boolean")) return null;

    // Every line must be well formed
    const lines = items.map(readItem);
    if (!lines.every((line: PlanningCardItem | null): line is PlanningCardItem => line !== null)) return null;
    return {kind: "cooperative_planning", title, brief, constraints, items: lines, complete};
}

// One item's line (null when malformed)
function readItem(value: unknown): PlanningCardItem | null {
    if (!isRecord(value)) return null;
    const {id, label, value: choice, pending} = value;
    if ((typeof id !== "string") || (typeof label !== "string") || !isTextOrNull(choice) || !isTextOrNull(pending)) return null;
    return {id, label, value: choice, pending};
}

// A plain JSON object
function isRecord(value: unknown): value is Record<string, unknown> {
    return (typeof value === "object") && (value !== null) && !Array.isArray(value);
}

// An array of strings
function isStringList(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((entry: unknown) => typeof entry === "string");
}

// A string, or null
function isTextOrNull(value: unknown): value is string | null {
    return (value === null) || (typeof value === "string");
}
