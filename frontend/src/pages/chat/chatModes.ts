/* The chat types the participant chat page can open, and how it reaches each.
--------------------------------------------------------------------------------
`@frontend/src/pages/chat/chatModes`

Each mode picks a chat type with the socket's query parameters
(`backend/chat_app/websocket/consumers/CLIENT_PROTOCOL.md` §1, Step 4). The
values copy the backend's chat type names and conditions
(`backend/chat_app/websocket/harnesses/registry.py`, and each harness's
`CONDITIONS`). A mode with cues sends `condition=cues` or `condition=no_cues`
from the configure-chat toggle; a mode with task content lists its variants,
copied from the harness with the name the picker shows (the default first). A
mode also lists the shared features its harness uses, which debug mode's panel
can switch partway through a chat (`set_feature`). Once the chat starts, the
query also carries the avatar and whether subtitles are on (`avatar`, and
`subtitles` as `on` or `off`; Step 5), which a task chat's run saves.

*/
import type { IconType                                        } from "react-icons";
import      { BsCardChecklist, BsChatHeart, BsChatQuote, BsMap } from "react-icons/bs";

// What shows beside the avatar: nothing, the participant's task card, or the Map Task's map
export type ChatPanel = "none" | "card" | "map";

// One version of a chat type's task content: the `variant` sent, and what the picker shows
export type ChatVariant = {value: string; label: string};

// One way the page can open a chat
export type ChatMode = {
    label       : string;          // What the picker and the page title show
    description : string;          // What the chat is, shown in the configure-chat modal
    icon        : IconType;        // Shown beside the description
    chatType    : string;          // `chat_type` sent on the socket
    hasCues     : boolean;         // The chat type has `cues` and `no_cues` conditions
    variants    : ChatVariant[];   // The chat type's task content to pick from, the default first (empty for none)
    panel       : ChatPanel;       // What shows beside the avatar
    features    : string[];        // Shared features debug mode can switch, copied from the harness (empty for none)
};

// The chat page's socket route
export const CHAT_PATH = "/ws/chat/";

// Each task's variants, copied from its harness (`MAP_TASK_VARIANTS` in `harnesses/map_task/harness.py`,
// `PLANNING_VARIANTS` in `harnesses/cooperative_planning/harness.py`, `ELICITATION_TOPICS` in
// `harnesses/speech_elicitation/topics.py`)
const MAP_TASK_VARIANTS: ChatVariant[] = [
    {value: "demo",   label: "Demo map"  },
    {value: "hcrc_1", label: "HCRC map 1"},
    {value: "hcrc_2", label: "HCRC map 2"},
    {value: "hcrc_3", label: "HCRC map 3"},
    {value: "hcrc_4", label: "HCRC map 4"},
];
const PLANNING_VARIANTS: ChatVariant[] = [
    {value: "dinner_party",     label: "Dinner party"       },
    {value: "day_trip",         label: "Day trip"           },
    {value: "birthday_party",   label: "Birthday party"     },
    {value: "movie_night",      label: "Movie night"        },
    {value: "hotel_room",       label: "Hotel room problems"},
    {value: "weekend_activity", label: "Weekend activity"   },
    {value: "club_event",       label: "Campus club event"  },
    {value: "house_party",      label: "House party"        },
    {value: "apartment_hunt",   label: "Apartment hunt"     },
    {value: "camping_trip",     label: "Camping trip"       },
    {value: "flight_rebooking", label: "Cancelled flight"   },
];
const ELICITATION_VARIANTS: ChatVariant[] = [
    {value: "pet_person",           label: "Cat, dog, or plant person"},
    {value: "mountains_or_beaches", label: "Mountains or beaches"     },
    {value: "retirement_spot",      label: "Where to retire"          },
];

// The shared features every task chat type uses, as each task harness names them in `self.features`
// (`harnesses/map_task/harness.py`, `cooperative_planning/harness.py`, `speech_elicitation/harness.py`)
const TASK_FEATURES = ["backchannels", "turn_end", "misheard"];

// Every mode the picker offers, the default first
export const CHAT_MODES: ChatMode[] = [
    {
        label       : "Open conversation",
        description : "A free-flowing chat about anything you like, with no task to work on.",
        icon        : BsChatHeart,
        chatType    : "unguided",
        hasCues     : false,
        variants    : [],
        panel       : "none",
        features    : [],
    },
    {
        label       : "Cooperative planning",
        description : "You and the avatar work out a plan together. Each of you knows things the other doesn't, and your card fills in as you agree on each item.",
        icon        : BsCardChecklist,
        chatType    : "cooperative_planning",
        hasCues     : true,
        variants    : PLANNING_VARIANTS,
        panel       : "card",
        features    : TASK_FEATURES,
    },
    {
        label       : "Map Task",
        description : "You have a map with a route drawn on it. Describe the route so the avatar can follow it on its own map.",
        icon        : BsMap,
        chatType    : "map_task",
        hasCues     : true,
        variants    : MAP_TASK_VARIANTS,
        panel       : "map",
        features    : TASK_FEATURES,
    },
    {
        label       : "Speech elicitation",
        description : "The avatar starts with a light question, and the two of you just talk. There is nothing to finish: stop whenever you feel done.",
        icon        : BsChatQuote,
        chatType    : "speech_elicitation",
        hasCues     : true,
        variants    : ELICITATION_VARIANTS,
        panel       : "none",
        features    : TASK_FEATURES,
    },
];

// The setup a chat started with, sent once with its socket (a task chat's run saves it)
export type ChatStartSetup = {
    avatar    : string;    // Avatar shown (an `AVATARS` id)
    subtitles : boolean;   // Subtitles on at the start
};

// The socket query for a mode, its variant (null for none), whether its cues are on, and its setup
// (the avatar and subtitles it started with, null before it starts)
export function chatModeQuery(mode: ChatMode, variant: string | null, cues: boolean, setup: ChatStartSetup | null): string {
    const query: Record<string, string> = {chat_type: mode.chatType};
    if (mode.hasCues)     query.condition = cues ? "cues" : "no_cues";
    if (variant !== null) query.variant   = variant;
    if (setup   !== null) { query.avatar = setup.avatar; query.subtitles = setup.subtitles ? "on" : "off"; }
    return new URLSearchParams(query).toString();
}
