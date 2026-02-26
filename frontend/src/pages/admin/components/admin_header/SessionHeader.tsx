import      { HeaderPills        } from "./HeaderPills";
import type { SessionHeaderProps } from "./StatusComponents";

// ================================================================================
// SessionHeader (for the chat listener)
// ================================================================================
export const SessionHeader: React.FC<SessionHeaderProps> = (props) => {
    const {
        title = "Session Monitor",
        sessionId,
        username,
        source,
        mode = "listener",
    } = props;

    // UI Component
    return (
        <header className="sticky top-0 z-10 bg-white border-b border-black/10">
            <div className="flex items-center justify-between gap-4 px-4 py-3">
                {/* -------------------------------------------------------------------------------- */}
                {/* Left: Title + Meta Data */}
                {/* -------------------------------------------------------------------------------- */}
                <div className="min-w-0">
                    <div className="text-base font-semibold truncate">{title}</div>
                    <div className="text-xs text-black/60 truncate">
                        {sessionId ? `Session #${sessionId}` : "No session"}
                        {username  ? ` · ${username}`        : ""}
                        {source    ? ` · Source: ${source}`  : ""}
                        {mode      ? ` · Mode: ${mode}`      : ""}
                    </div>
                </div>

                {/* Right: Status Pills */}
                <HeaderPills {...props} />
                
            </div>
        </header>
    );
};
