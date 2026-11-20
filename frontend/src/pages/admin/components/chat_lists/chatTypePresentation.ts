/* Names and visual identities for the chat types in admin session views.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/chat_lists/chatTypePresentation`

*/
import type { IconType } from "react-icons";
import      { LuClipboardList, LuEar, LuMap, LuMessagesSquare, LuNotebookPen, LuSpeech } from "react-icons/lu";

// One chat type's readable name, icon, and badge colors
export type ChatTypePresentation = {label: string; icon: IconType; className: string};

// The chat-type pill's shape and type, which its colors (`className`) complete (session cards, and the task details button)
export const CHAT_TYPE_PILL_CLASS = "inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm font-semibold";

// Harness names come from backend/chat_app/websocket/harnesses/registry.py
const CHAT_TYPE_PRESENTATION: Record<string, ChatTypePresentation> = {
    map_task             : {label: "Map Task",             icon: LuMap,            className: "bg-sky-50 text-sky-800 border-sky-200"},
    cooperative_planning : {label: "Cooperative Planning", icon: LuClipboardList,  className: "bg-amber-50 text-amber-800 border-amber-200"},
    speech_elicitation   : {label: "Speech Elicitation",   icon: LuSpeech,         className: "bg-rose-50 text-rose-800 border-rose-200"},
    active_listening     : {label: "Active Listening",     icon: LuEar,            className: "bg-violet-50 text-violet-800 border-violet-200"},
    activity             : {label: "Memory Activity",      icon: LuNotebookPen,    className: "bg-emerald-50 text-emerald-800 border-emerald-200"},
    unguided             : {label: "Open Conversation",    icon: LuMessagesSquare, className: "bg-slate-100 text-slate-700 border-slate-200"},
};

// Chat types whose completed sessions have a task details page (their maps, decisions, or threads, with stats)
const TASK_DETAIL_CHAT_TYPES: readonly string[] = ["map_task", "cooperative_planning", "speech_elicitation"];

// Whether a completed session has a task details page
export function hasTaskDetails(chatType: string): boolean {
    return TASK_DETAIL_CHAT_TYPES.includes(chatType);
}

// Older sessions have no recorded type; future types still get readable names
export function chatTypePresentation(chatType: string): ChatTypePresentation {
    return CHAT_TYPE_PRESENTATION[chatType] ?? {label: chatType ? chatType.replaceAll("_", " ") : "Chat type not recorded", icon: LuMessagesSquare, className: "bg-slate-100 text-slate-700 border-slate-200"};
}

// Words in variant names shown in capitals ("hcrc_1" shows as "HCRC 1")
const CHAT_RUN_ACRONYMS: readonly string[] = ["hcrc"];

// Cue conditions have short display names; variant names keep their identifying numbers
export function chatRunLabel(value: string): string {
    if (value === "cues")    return "With cues";
    if (value === "no_cues") return "No cues";
    return value.split("_").map((word: string) => CHAT_RUN_ACRONYMS.includes(word) ? word.toUpperCase() : word).join(" ");
}
