/* The chat types the participant chat page can open, and how it reaches each.
--------------------------------------------------------------------------------
`@frontend/src/pages/chat/chatModes`

Each mode picks a chat type with the socket's query parameters
(`backend/chat_app/websocket/consumers/CLIENT_PROTOCOL.md` §1, Step 4). The
values copy the backend's chat type names and conditions
(`backend/chat_app/websocket/harnesses/registry.py`, and each harness's
`CONDITIONS`); a mode that leaves one out gets the chat type's default. A mode
with task content lists its variants, copied from the harness with the name the
picker shows (the page picks the first unless the participant picks another).
The memory activity keeps its older route, `ws/chat/activity/`.

*/
// What shows beside the avatar: nothing, the participant's task card, the Map Task's instructions, or the activity's debug log
export type ChatPanel = "none" | "card" | "map" | "activity_debug";

// One version of a chat type's task content: the `variant` sent, and what the picker shows
export type ChatVariant = {value: string; label: string};

// One way the page can open a chat
export type ChatMode = {
    label    : string;                   // What the picker shows
    wsPath   : string;                   // The socket route
    query    : Record<string, string>;   // `chat_type` and `condition` (empty for the backend's defaults)
    variants : ChatVariant[];            // The chat type's task content to pick from, the default first (empty for none)
    panel    : ChatPanel;                // What shows beside the avatar
};

// The socket routes
const CHAT_PATH          = "/ws/chat/";
const CHAT_ACTIVITY_PATH = "/ws/chat/activity/";

// Each task's variants, copied from its harness (`MAP_TASK_VARIANTS` in `harnesses/map_task/harness.py`,
// `PLANNING_VARIANTS` in `harnesses/cooperative_planning/harness.py`)
const MAP_TASK_VARIANTS: ChatVariant[] = [
    {value: "demo",   label: "Demo map"  },
    {value: "hcrc_1", label: "HCRC map 1"},
    {value: "hcrc_2", label: "HCRC map 2"},
    {value: "hcrc_3", label: "HCRC map 3"},
    {value: "hcrc_4", label: "HCRC map 4"},
];
const PLANNING_VARIANTS: ChatVariant[] = [
    {value: "dinner_party", label: "Dinner party"},
];

// Every mode the picker offers, the default first
export const CHAT_MODES: ChatMode[] = [
    {label: "Open conversation",       wsPath: CHAT_PATH,          query: {},                                                         variants: [],                panel: "none"          },
    {label: "Active listening",        wsPath: CHAT_PATH,          query: {chat_type: "active_listening"},                            variants: [],                panel: "none"          },
    {label: "Memory activity",         wsPath: CHAT_ACTIVITY_PATH, query: {},                                                         variants: [],                panel: "activity_debug"},
    {label: "Map Task",                wsPath: CHAT_PATH,          query: {chat_type: "map_task",             condition: "cues"},     variants: MAP_TASK_VARIANTS, panel: "map"           },
    {label: "Map Task (no cues)",      wsPath: CHAT_PATH,          query: {chat_type: "map_task",             condition: "no_cues"},  variants: MAP_TASK_VARIANTS, panel: "map"           },
    {label: "Plan together",           wsPath: CHAT_PATH,          query: {chat_type: "cooperative_planning", condition: "cues"},     variants: PLANNING_VARIANTS, panel: "card"          },
    {label: "Plan together (no cues)", wsPath: CHAT_PATH,          query: {chat_type: "cooperative_planning", condition: "no_cues"},  variants: PLANNING_VARIANTS, panel: "card"          },
];
