/* The chat types the participant chat page can open, and how it reaches each.
--------------------------------------------------------------------------------
`@frontend/src/pages/chat/chatModes`

Each mode picks a chat type with the socket's query parameters
(`backend/chat_app/websocket/consumers/CLIENT_PROTOCOL.md` §1, Step 4). The
values copy the backend's chat type names and conditions
(`backend/chat_app/websocket/harnesses/registry.py`, and each harness's
`CONDITIONS`); a mode that leaves one out gets the chat type's default. The
memory activity keeps its older route, `ws/chat/activity/`.

*/
// What shows beside the avatar: nothing, the participant's task card, the Map Task's instructions, or the activity's debug log
export type ChatPanel = "none" | "card" | "map" | "activity_debug";

// One way the page can open a chat
export type ChatMode = {
    label  : string;                   // What the picker shows
    wsPath : string;                   // The socket route
    query  : Record<string, string>;   // `chat_type`, `condition`, and `variant` (empty for the backend's defaults)
    panel  : ChatPanel;                // What shows beside the avatar
};

// The socket routes
const CHAT_PATH          = "/ws/chat/";
const CHAT_ACTIVITY_PATH = "/ws/chat/activity/";

// Every mode the picker offers, the default first
export const CHAT_MODES: ChatMode[] = [
    {label: "Open conversation",       wsPath: CHAT_PATH,          query: {},                                                         panel: "none"          },
    {label: "Active listening",        wsPath: CHAT_PATH,          query: {chat_type: "active_listening"},                            panel: "none"          },
    {label: "Memory activity",         wsPath: CHAT_ACTIVITY_PATH, query: {},                                                         panel: "activity_debug"},
    {label: "Map Task",                wsPath: CHAT_PATH,          query: {chat_type: "map_task"},                                    panel: "map"           },
    {label: "Plan together",           wsPath: CHAT_PATH,          query: {chat_type: "cooperative_planning", condition: "cues"},     panel: "card"          },
    {label: "Plan together (no cues)", wsPath: CHAT_PATH,          query: {chat_type: "cooperative_planning", condition: "no_cues"},  panel: "card"          },
];
