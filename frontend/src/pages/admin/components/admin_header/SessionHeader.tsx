import      { HeaderPills        } from "./HeaderPills";
import type { SessionHeaderProps } from "./StatusComponents";

// ================================================================================
// SessionHeader (for the chat listener)
// ================================================================================
export const SessionHeader: React.FC<SessionHeaderProps> = (props) => {
    const { title, sessionId, username, source, mode, } = props;

    const show_session_id = sessionId ? `#${sessionId}` : "#--";

    // UI Component
    return (
        <header className="sticky top-0 z-10 bg-white border-b border-black/10">
            <div className="flex items-center justify-between gap-4 px-4 py-3">

                {/* Left Side: Title + Meta Data */}
                <div className="min-w-0 flex gap-4 items-center">
                    <div className="text-base font-semibold truncate">{`${title} ${show_session_id}`}</div>
                    <div className="text-xs text-black/60 truncate">
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
