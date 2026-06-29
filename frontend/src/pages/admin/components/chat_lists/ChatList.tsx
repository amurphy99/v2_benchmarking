/* List view for admin navigation via ChatSessionCards.
--------------------------------------------------------------------------------
`frontend/src/pages/admin/components/chat_lists/ChatList.tsx`

Separated into two lists: one for all currently active chats and one for all 
completed chats. 

For the inactive ChatSessionCard list, chats are split into groups based on the
day/week of the chat. More recent days get separate groups while older chats are
grouped by week.
*/
import { memo, useMemo } from "react";
import { useNavigate   } from "react-router-dom";
import { LuRefreshCw   } from "react-icons/lu";

// From this project
import { ChatSession     } from "@/api";
import { ChatSessionCard } from "./ChatSessionCard";
import { SectionHeader   } from "../ui/SectionHeader";
import { Pill            } from "../ui/Pill";
import { AdminButton     } from "../ui/AdminButton";
import { groupByRecency  } from "./timeGrouping";

// ================================================================================
// List of ChatSessions for the Admin page (either only Active chats, or all chats)
// ================================================================================
export const ChatList = memo(function ChatList({
    title,
    subtitle = "",
    sessions,
    onRefresh,
    navigate_to,
    variant = "completed",
    grouped = false,
}: {
    title       : string;
    subtitle  ? : string | null;
    sessions    : ChatSession[];
    onRefresh ? : () => void;
    navigate_to : string;
    variant   ? : "active" | "completed";
    grouped   ? : boolean;
}) {
    const navigate = useNavigate();

    // Cards arranged either as a single grid (active) or grouped by recency
    // (completed). `auto-rows-fr` keeps every card in the same row at equal
    // height so the headers line up regardless of body content length.
    const groups = useMemo(() => grouped ? groupByRecency(sessions) : null, [grouped, sessions]);

    const cardGridClass = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3 auto-rows-fr";

    return (
        <section>

            {/* -------------------------------------------------------------------------------- */}
            {/* "Header" with a title for the list and the refresh button */}
            {/* -------------------------------------------------------------------------------- */}
            <SectionHeader
                title    = {title}
                subtitle = {subtitle}
                badge    = {<Pill variant={variant === "active" ? "live" : "info"} dot={variant === "active"} value={sessions.length ?? 0} />}
                actions  = {onRefresh && (
                    <AdminButton variant="outline" size="sm" iconLeft={<LuRefreshCw size={14} />} onClick={onRefresh}>
                        Refresh
                    </AdminButton>
                )}
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
                        {sessions.map(session => (
                            <ChatSessionCard
                                key     ={session.id}
                                session ={session}
                                onClick ={() => navigate(`${navigate_to}${session.id}`)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
});
