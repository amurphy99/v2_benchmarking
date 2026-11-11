/* Filters for the Monitor page's chat lists: chat type, condition, and variant.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/chat_lists/ChatRunFilterBar`

Each dropdown offers the values found in the sessions loaded (`chatRunFilter`),
so it never lists a chat type nobody has run. "" (a chat type with no condition
or variant, or a session from before they were recorded) shows as "Not recorded".

*/
import type { ReactElement     } from "react";
import      { LuRefreshCw, LuX } from "react-icons/lu";

// From this project
import type { ChatSession                                                    } from "@/api";
import      { AdminButton                                                    } from "../ui/AdminButton";
import type { ChatRunField, ChatRunFilter                                    } from "./chatRunFilter";
import      { CHAT_RUN_ANY, CHAT_RUN_FIELDS, chatRunOptions, setChatRunField } from "./chatRunFilter";
import      { chatRunLabel, chatTypePresentation                             } from "./chatTypePresentation";

// Each dropdown's label
const CHAT_RUN_LABELS: Record<ChatRunField, string> = {
    chat_type : "Chat type",
    condition : "Condition",
    variant   : "Variant",
};

// The dropdown value standing for "match any" (no real field value is this)
const CHAT_RUN_ANY_VALUE = "__any__";


// --------------------------------------------------------------------------------
// Chat Run Filter Bar
// --------------------------------------------------------------------------------
// One dropdown per field, and a button that clears them all
export default function ChatRunFilterBar({sessions, filter, onChange, onRefresh, refreshing}: {
    sessions   : ChatSession[];                    // Both lists, for the values to offer
    filter     : ChatRunFilter;                    // The filter now
    onChange   : (filter: ChatRunFilter) => void;  // Set the changed filter
    onRefresh  : () => Promise<void>;              // Refresh both lists together
    refreshing : boolean;                          // Either list is fetching
}): ReactElement {
    const options  = chatRunOptions(sessions, filter);
    const filtered = CHAT_RUN_FIELDS.some((field: ChatRunField) => filter[field] !== null);

    return (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-admin-border bg-admin-panel px-4 py-3 shadow-sm">
            <div className="self-center text-sm font-semibold uppercase tracking-wide text-admin-subtext">Filter chats</div>

            {CHAT_RUN_FIELDS.map((field: ChatRunField) => (
                <label key={field} className="flex! w-full sm:w-auto items-center gap-2 text-sm text-admin-subtext">
                    <span className="w-20 sm:w-auto shrink-0 whitespace-nowrap">{CHAT_RUN_LABELS[field]}</span>
                    <select
                        className = "min-w-0 flex-1 sm:flex-none rounded-lg border border-admin-border bg-admin-panel px-2 py-1 text-sm text-admin-text"
                        onChange  = {(event) => onChange(setChatRunField(filter, field, (event.target.value === CHAT_RUN_ANY_VALUE) ? null : event.target.value))}
                        value     = {filter[field] ?? CHAT_RUN_ANY_VALUE}
                    >
                        <option value={CHAT_RUN_ANY_VALUE}>All</option>
                        {options[field].map((value: string) => <option key={value} value={value}>{(value === "") ? "Not recorded" : ((field === "chat_type") ? chatTypePresentation(value).label : chatRunLabel(value))}</option>)}
                    </select>
                </label>
            ))}

            {filtered ? (
                <AdminButton variant="outline" size="sm" iconLeft={<LuX size={14} />} onClick={() => onChange(CHAT_RUN_ANY)}>
                    Clear
                </AdminButton>
            ) : null}

            {/* One refresh for both lists (full width on phones) */}
            <div className="w-full sm:w-auto sm:ml-auto">
                <AdminButton type="button" variant="primary" size="md" className="w-full sm:w-auto justify-center rounded-lg! bg-admin-accent! text-white! hover:bg-admin-accent2!" disabled={refreshing} aria-busy={refreshing} onClick={onRefresh} iconLeft={<LuRefreshCw size={16} className={refreshing ? "animate-spin" : ""} />}>
                    {refreshing ? "Refreshing…" : "Refresh chats"}
                </AdminButton>
            </div>
        </div>
    );
}
