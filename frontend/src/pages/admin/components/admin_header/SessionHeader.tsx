import { useNavigate } from "react-router-dom";

import      { HeaderPills        } from "./HeaderPills";
import type { SessionHeaderProps } from "./StatusComponents";

// ================================================================================
// SessionHeader (for the chat listener)
// ================================================================================
export const SessionHeader: React.FC<SessionHeaderProps> = (props) => {
    const navigate = useNavigate();

    const { title, sessionId, username, source, mode, } = props;
    const show_session_id = sessionId ? `#${sessionId}` : "#--";

    const button_back =
        "shrink-0 w-[2rem] h-[2rem] flex items-center justify-center " +
        "rounded-lg border border-black/10 bg-black/5 hover:bg-black/10 transition " +
        "text-lg leading-none";

    // UI Component
    return (
        <header className="sticky top-0 z-10 bg-white border-b border-black/10">
            <div className="flex items-center justify-between gap-4 px-4 py-3">

                {/* Left Side: Title + Meta Data */}
                <div className="min-w-0 flex gap-[1.5rem] items-center">
                    <button type="button" onClick={() => navigate("/admin")} 
                        className={button_back} aria-label="Back to admin" title="Back"
                    >&lsaquo;</button>
                    
                    <div className="text-lg font-semibold truncate">{`${title} ${show_session_id}`}</div>
                    
                    <div className="text-base text-black/60 truncate">
                        {username  ? `Username: ${username}` : ""}
                        {source    ? ` · Source: ${source}`  : ""}
                        {mode      ? ` · Mode: ${mode}`      : ""}
                    </div>
                </div>

                {/* Right Side: Status Pills */}
                <HeaderPills {...props} />
                
            </div>
        </header>
    );
};
