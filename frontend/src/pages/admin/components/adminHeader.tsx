import { useEffect, useMemo, useState } from "react";

// --------------------------------------------------------------------------------
// Type Definitions
// --------------------------------------------------------------------------------
type ConnectionState    = "connecting" | "connected" | "reconnecting" | "disconnected";
type SessionHeaderProps = {
    title        ? : string;
    sessionId    ? : number | string;
    username     ? : string;
    source       ? : string;
    mode         ? : "primary" | "listener";
    wsState        : ConnectionState;
    lastEventAt  ? : Date | null;
    latencyMs    ? : number | null;
    startTsUnix  ? : number | null;     // seconds since epoch
    messageCount ? : number | null;
};

// --------------------------------------------------------------------------------
// Formatters
// --------------------------------------------------------------------------------
// Format the "time since last update" field
function formatAgo(d: Date | null | undefined): string {
    if (!d) return "—";
    const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);

    if (s <  5) return "just now";
    if (s < 60) return `${s}s ago`;
    if (m < 60) return `${m}m ago`;
    return `${h}h ago`;
}
// Format the "chat duration" field
function formatDurationFromStart(startTsUnix: number | null | undefined): string {
    if (!startTsUnix) return "—";
    const elapsed = Math.max(0, Math.floor(Date.now() / 1000 - startTsUnix));
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
}

// --------------------------------------------------------------------------------
// Prepare Status Components
// --------------------------------------------------------------------------------
// Display the WebSocket's connection state 
function connBadge(state: ConnectionState) {
    switch (state) {
        case "connected"    : return { text: "Connected",    dot: "bg-green-500", pill: "bg-green-50 text-green-700 border-green-200" };
        case "reconnecting" : return { text: "Reconnecting", dot: "bg-amber-500", pill: "bg-amber-50 text-amber-700 border-amber-200" };
        case "connecting"   : return { text: "Connecting",   dot: "bg-gray-400",  pill: "bg-gray-50  text-gray-700  border-gray-200"  };
        case "disconnected" : 
        default:              return { text: "Disconnected", dot: "bg-red-500",   pill: "bg-red-50   text-red-700   border-red-200"   };
    }
}
// General "pill" wrapper for different status information
const StatPill: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div className="flex items-center gap-2 rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs whitespace-nowrap">
        <span className="text-black/60">{label}</span>
        <span className="font-medium">  {value}</span>
    </div>
);

// ================================================================================
// SessionHeader (for the chat listener)
// ================================================================================
export const SessionHeader: React.FC<SessionHeaderProps> = ({
    title = "Session Monitor",
    sessionId,
    username,
    source,
    mode = "listener",
    wsState,
    lastEventAt,
    latencyMs,
    startTsUnix,
    messageCount,
}) => {
    // Connection state display
    const badge = useMemo(() => connBadge(wsState), [wsState]);

    // Tick so duration & "ago" update even without new events
    const [, forceTick] = useState(0);
    useEffect(() => {
        const id = window.setInterval(() => forceTick((x) => x + 1), 1000);
        return () => window.clearInterval(id);
    }, []);

    // Component
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

                {/* -------------------------------------------------------------------------------- */}
                {/* Right: Status Pills */}
                {/* -------------------------------------------------------------------------------- */}
                <div className="flex items-center gap-2 flex-wrap justify-end">
                    <div className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${badge.pill}`}>
                        <span className={`h-2 w-2 rounded-full ${badge.dot}`} />
                        <span className="font-medium">{badge.text}</span>
                    </div>

                    <StatPill label="Duration"   value={formatDurationFromStart(startTsUnix)} />
                    <StatPill label="Messages"   value={messageCount ?? "—"} />
                    <StatPill label="Last event" value={formatAgo(lastEventAt)} />
                    <StatPill label="Latency"    value={latencyMs != null ? `${latencyMs} ms` : "—"} />
                </div>
            </div>
        </header>
    );
};
