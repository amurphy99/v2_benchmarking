/* SessionHeader.tsx
--------------------------------------------------------------------------------
Header component for the Admin ChatSession views. Shared by both the active chat
page (AdminChat.tsx) and the inactive chat page (AdminChatInactive.tsx).

*/
import { useNavigate    } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { LuArrowLeft } from "react-icons/lu";

import      { HeaderPills        } from "./HeaderPills";
import      { AdminButton        } from "../ui/AdminButton";
import type { SessionHeaderProps } from "./StatusComponents";

// Optional props for added navigation buttons (to secondary analysis pages)
interface ExtendedProps extends SessionHeaderProps {
    rightActions?: React.ReactNode;
}

// ================================================================================
// SessionHeader (for the chat listener)
// ================================================================================
export const SessionHeader: React.FC<ExtendedProps> = (props) => {
    const navigate = useNavigate   ();
    const qc       = useQueryClient();

    // Force a refresh of the chat-list queries when navigating back so newly-completed sessions show up in the right list
    const handleBackClick = () => {
        qc.invalidateQueries({ queryKey: ["activeChatSessions"  ] });
        qc.invalidateQueries({ queryKey: ["inactiveChatSessions"] });
        navigate(-1);
    };

    // ChatSession information
    const { title, sessionId, username, source, mode, rightActions } = props;
    const show_session_id = sessionId ? `#${sessionId}` : "#--";

    // UI Component
    return (
        <header className="sticky top-0 z-10 bg-admin-panel/95 backdrop-blur border-b border-admin-border">
            <div className="flex items-center justify-between gap-4 px-4 md:px-6 py-3 flex-wrap">

                {/* -------------------------------------------------------------------------------- */}
                {/* Left Side => Back Button | Title | Meta Data */}
                {/* -------------------------------------------------------------------------------- */}
                <div className="min-w-0 flex gap-3 items-center flex-wrap">
                    {/* Back Button for Navigation */}
                    <button
                        onClick   = {handleBackClick}
                        className = "flex items-center justify-center h-8 w-8 rounded-md text-admin-text hover:bg-admin-muted cursor-pointer"
                        aria-label = "Back"
                    >
                        <LuArrowLeft size={20} />
                    </button>

                    <div className="flex flex-col min-w-0">
                        {/* Session "Title" */}
                        <div className="text-base md:text-lg font-semibold text-admin-text truncate">
                            {title} <span className="text-admin-subtext font-normal">{show_session_id}</span>
                        </div>

                         {/* Some Session Info */}
                        <div className="text-xs text-admin-subtext truncate">
                            {username  && <>Username: <span className="text-admin-text/80">{username}</span></>}
                            {source    && <> · Source: <span className="text-admin-text/80">{source}</span></>}
                            {mode      && <> · Mode: <span className="text-admin-text/80">{mode}</span></>}
                        </div>
                    </div>
                </div>

                {/* -------------------------------------------------------------------------------- */}
                {/* Right Side => Action Button | Status Pills */}
                {/* -------------------------------------------------------------------------------- */}
                <div className="flex items-center gap-3 flex-wrap justify-end">
                    {rightActions}
                    <HeaderPills {...props} />
                </div>

            </div>
        </header>
    );
};

