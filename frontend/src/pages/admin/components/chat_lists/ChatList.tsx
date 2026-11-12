/* List view for admin navigation via ChatSessionCards.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/chat_lists/ChatList`

Separated into two lists: one for all currently active chats and one for all 
completed chats. 

For the inactive ChatSessionCard list, chats are split into groups based on the
day/week of the chat. More recent days get separate groups while older chats are
grouped by week.

With `pageSize`, only the newest `pageSize` sessions render at first (the list
arrives newest-first from the API), and a footer offers to load more or all.

*/
import { memo, useMemo, useState } from "react";
import { useNavigate             } from "react-router-dom";

// From this project
import { ChatSession     } from "@/api";
import { ChatSessionCard } from "./ChatSessionCard";
import { SectionHeader   } from "../ui/SectionHeader";
import { Pill            } from "../ui/Pill";
import { groupByRecency  } from "./timeGrouping";

// ================================================================================
// List of ChatSessions for the Admin page (either only Active chats, or all chats)
// ================================================================================
export const ChatList = memo(function ChatList({
    title,
    subtitle = "",
    sessions,
    navigate_to,
    variant = "completed",
    grouped = false,
    pageSize,
}: {
    title       : string;
    subtitle  ? : string | null;
    sessions    : ChatSession[];
    navigate_to : string;
    variant   ? : "active" | "completed";
    grouped   ? : boolean;
    pageSize  ? : number;  // Sessions shown per "Load more" step (omit to show every session)
}) {
    const navigate = useNavigate();

    // Newest sessions up to the current page limit
    const [shownCount, setShownCount] = useState<number>(pageSize ?? Infinity);
    const visible   = useMemo((): ChatSession[] => sessions.slice(0, shownCount), [sessions, shownCount]);
    const remaining = sessions.length - visible.length;

    // Cards arranged either as a single grid (active) or grouped by recency
    // (completed). `auto-rows-fr` keeps every card in the same row at equal
    // height so the headers line up regardless of body content length.
    const groups = useMemo(() => grouped ? groupByRecency(visible) : null, [grouped, visible]);

    const cardGridClass = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3 auto-rows-fr";

    return (
        <section>

            {/* -------------------------------------------------------------------------------- */}
            {/* List heading and session count */}
            {/* -------------------------------------------------------------------------------- */}
            <SectionHeader
                title    = {title}
                subtitle = {subtitle}
                badge    = {<Pill variant={variant === "active" ? "live" : "info"} dot={variant === "active"} value={sessions.length ?? 0} />}
                className = "mb-3"
            />

            {/* -------------------------------------------------------------------------------- */}
            {/* List of ChatSession Cards */}
            {/* -------------------------------------------------------------------------------- */}
            <div className="rounded-xl border border-admin-border bg-admin-panel p-4 shadow-sm">
                {sessions.length === 0 ? (
                    <div className="text-base text-admin-subtext py-6 text-center">
                        {variant === "active"
                            ? "No live sessions right now."
                            : "No completed sessions to display."}
                    </div>
                ) : groups ? (
                    <div className="flex flex-col">
                        {groups.map((g, idx) => (
                            <div
                                key       ={g.key}
                                className ={idx === 0 ? "" : "mt-5 pt-5 border-t border-admin-border"}
                            >
                                <div className="text-sm font-semibold uppercase tracking-wide text-admin-subtext mb-2 px-1">
                                    {g.label}
                                </div>
                                <div className={cardGridClass}>
                                    {g.sessions.map(session => (
                                        <ChatSessionCard
                                            key     ={session.id}
                                            session ={session}
                                            onClick ={() => navigate(`${navigate_to}${session.id}`)}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className={cardGridClass}>
                        {visible.map(session => (
                            <ChatSessionCard
                                key     ={session.id}
                                session ={session}
                                onClick ={() => navigate(`${navigate_to}${session.id}`)}
                            />
                        ))}
                    </div>
                )}

                {/* Page count and load-more controls */}
                {(pageSize !== undefined) && (sessions.length > pageSize) ? (
                    <div className="mt-4 pt-4 border-t border-admin-border flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm text-admin-subtext">
                            Showing {visible.length} of {sessions.length} chats
                        </div>
                        {remaining > 0 ? (
                            <div className="flex gap-2">
                                <button
                                    className = "px-3 py-1.5 rounded-lg border border-admin-border text-sm font-medium text-admin-text hover:bg-admin-muted2 transition-colors"
                                    onClick   = {() => setShownCount(visible.length + pageSize)}
                                >
                                    Load {Math.min(pageSize, remaining)} more
                                </button>
                                <button
                                    className = "px-3 py-1.5 rounded-lg bg-admin-text text-white text-sm font-medium hover:opacity-90 transition-opacity"
                                    onClick   = {() => setShownCount(Infinity)}
                                >
                                    Show all
                                </button>
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </section>
    );
});
