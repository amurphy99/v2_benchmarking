/* What a chat ran (chat type, cue condition, task variant), and filtering by it.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/chat_lists/chatRunFilter`

Every session records the chat type its harness ran, its cue condition, and its
task variant (`ChatSession` in `backend/chat_app/models.py`; "" when it had
none, and on sessions from before chat types were recorded). The session headers
show them in one line with readable names, and the Chat History page filters its
chat lists on them. Field names keep the wire's spelling.

*/
import type { ChatSession                        } from "@/api";
import      { chatRunLabel, chatTypePresentation } from "./chatTypePresentation";

// What one chat ran (a REST session and the listener's `session_info` both carry these)
export type ChatRun = {
    chat_type : string;   // Harness that ran ("cooperative_planning")
    condition : string;   // Its cue set ("cues"; "" for none)
    variant   : string;   // Its task content ("dinner_party"; "" for none)
};

// The fields a filter can match, in the order they narrow (a condition belongs to a chat type)
export const CHAT_RUN_FIELDS = ["chat_type", "condition", "variant"] as const;

// One of those fields
export type ChatRunField = (typeof CHAT_RUN_FIELDS)[number];

// The value each field must have (null matches any)
export type ChatRunFilter = Record<ChatRunField, string | null>;

// A filter that matches every session
export const CHAT_RUN_ANY: ChatRunFilter = {chat_type: null, condition: null, variant: null};


// --------------------------------------------------------------------------------
// Showing What Ran
// --------------------------------------------------------------------------------
// What a chat ran in one line ("Cooperative Planning · With cues · dinner party"), null when nothing was recorded
export function chatRunText(run: ChatRun): string | null {
    const parts = CHAT_RUN_FIELDS
        .filter((field: ChatRunField) => run[field] !== "")
        .map((field: ChatRunField) => (field === "chat_type") ? chatTypePresentation(run[field]).label : chatRunLabel(run[field]));
    return (parts.length > 0) ? parts.join(" · ") : null;
}


// --------------------------------------------------------------------------------
// Filtering
// --------------------------------------------------------------------------------
// Whether a session matches every field the filter sets (only the listed fields are checked)
function matchesFields(session: ChatSession, filter: ChatRunFilter, fields: readonly ChatRunField[]): boolean {
    return fields.every((field: ChatRunField) => (filter[field] === null) || (session[field] === filter[field]));
}

// Whether a session matches the whole filter
export function matchesChatRun(session: ChatSession, filter: ChatRunFilter): boolean {
    return matchesFields(session, filter, CHAT_RUN_FIELDS);
}

// Each field's values among the sessions matching the fields before it (so the conditions offered are the chosen chat type's), sorted
export function chatRunOptions(sessions: ChatSession[], filter: ChatRunFilter): Record<ChatRunField, string[]> {
    const valuesOf = (field: ChatRunField): string[] => {
        const earlier = CHAT_RUN_FIELDS.slice(0, CHAT_RUN_FIELDS.indexOf(field));
        const values  = sessions.filter((session: ChatSession) => matchesFields(session, filter, earlier)).map((session: ChatSession) => session[field]);
        return [...new Set(values)].sort();
    };
    return {chat_type: valuesOf("chat_type"), condition: valuesOf("condition"), variant: valuesOf("variant")};
}

// The filter with one field changed (a new chat type or condition clears the fields after it, which belonged to the old one)
export function setChatRunField(filter: ChatRunFilter, field: ChatRunField, value: string | null): ChatRunFilter {
    const later = CHAT_RUN_FIELDS.slice(CHAT_RUN_FIELDS.indexOf(field) + 1);
    return {...filter, [field]: value, ...Object.fromEntries(later.map((laterField: ChatRunField) => [laterField, null]))};
}
