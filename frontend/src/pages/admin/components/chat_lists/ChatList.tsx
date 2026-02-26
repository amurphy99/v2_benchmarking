import { memo, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { ChatSession } from "@/api";
import { ChatSessionCard } from "./ChatSessionCard";

// ================================================================================
// List of ChatSessions for the Admin page (either only Active chats, or all chats)
// ================================================================================
export const ChatList = memo(function ChatList({ title, subtitle="", sessions, onRefresh, navigate_to }: {
    title       : string;
    subtitle  ? : string | null;
    sessions    : ChatSession[];
    onRefresh ? : () => void;
    navigate_to : string;
}) {
    const navigate = useNavigate();

    // Style
    const style_count   = "text-base rounded-full border border-black-300 bg-black/5 px-2 py-0.5 text-black/70";
    const style_refresh = "text-lg px-3 py-2 rounded-xl border border-black/10 bg-black/5 hover:bg-black/10 transition whitespace-nowrap";

    // --------------------------------------------------------------------------------
    // Return UI component
    // --------------------------------------------------------------------------------
    return (
        <section className="">

            {/* -------------------------------------------------------------------------------- */}
            {/* "Header" with a title for the list and the refresh button */}
            {/* -------------------------------------------------------------------------------- */}
            <div className="flex items-center justify-between gap-[1rem] px-[0rem] py-[1rem] pr-[1rem]">
                {/* Title & Subtitle */}                
                <div className="min-w-0 flex items-end gap-[0.5rem]">
                    <span className={style_count}>{sessions.length ?? 0}</span>
                    <div className="text-xl font-semibold">{title}</div>
                    {subtitle && <div className="text-base text-black/60">{subtitle}</div>}
                </div>
                
                {/* Refresh Button */}
                {onRefresh && (<button onClick={onRefresh} className={style_refresh}>Refresh</button>)}
            </div>

            {/* -------------------------------------------------------------------------------- */}
            {/* List of ChatSession Cards */}
            {/* -------------------------------------------------------------------------------- */}
            <div className="px-[1rem] py-[1rem] rounded-2xl border border-black/10 bg-white shadow-sm">
                {sessions.length === 0 ? ( <div className="text-sm text-black/60">No active sessions right now.</div> ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-[1rem]">
                        {sessions.map((session: ChatSession) => {return (
                            <ChatSessionCard 
                                key     = {session.id} 
                                session = {session} 
                                onClick = {() => navigate(`${navigate_to}${session.id}`)} 
                            />
                        );})}
                    </div>
                )}
            </div>

        </section>
    );
});
