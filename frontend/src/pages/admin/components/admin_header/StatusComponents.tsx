// ================================================================================
// Admin Chat Header Status Components
// ================================================================================
import { memo, useMemo, useState, useEffect } from "react";
import { formatAgo, formatElapsedTime, formatDurationFromStart } from "@/utils/styling/numFormatting";

// --------------------------------------------------------------------------------
// Connection State Indicator
// --------------------------------------------------------------------------------
// Display the WebSocket's connection state 
export type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected" | "offline";
export function connBadge(state: ConnectionState) {
    switch (state) {
        case "connected"    : return { text: "Connected",    dot: "bg-green-500", pill: "bg-green-50 text-green-700 border-green-200" };
        case "reconnecting" : return { text: "Reconnecting", dot: "bg-amber-500", pill: "bg-amber-50 text-amber-700 border-amber-200" };
        case "connecting"   : return { text: "Connecting",   dot: "bg-gray-400",  pill: "bg-gray-50  text-gray-700  border-gray-200"  };
        case "offline"      : return { text: "Offline",      dot: "bg-gray-400",  pill: "bg-gray-50  text-gray-700  border-gray-200"  };
        case "disconnected" : 
        default:              return { text: "Disconnected", dot: "bg-red-500",   pill: "bg-red-50   text-red-700   border-red-200"   };
    }
}

export const ConnectionPill = memo(function ConnPill({ wsState }: { wsState: ConnectionState }) {
    const badge = useMemo(() => connBadge(wsState), [wsState]);
    return (
        <div className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${badge.pill}`}>
        <span className={`h-2 w-2 rounded-full ${badge.dot}`} />
        <span className="font-medium">{badge.text}</span>
        </div>
    );
});

// ================================================================================
// Live-updating StatusPills for the AdminChat page headers
// ================================================================================
// General "pill" wrapper for different status information
export const InfoPill: React.FC<{ label: string; value?: React.ReactNode, children?: React.ReactNode }> = ({ label, value, children }) => (
    <div className="flex items-center gap-2 rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs whitespace-nowrap">
        <span className="text-black/60">{label}                    </span>
        <span className="font-medium">  {value ?? children ?? "—"} </span>
    </div>
);

// Separate group for the LIVE chat pills only
export const LivePills = memo(function LivePills({
    startTsUnix,
    lastEventAt,
    latencyMs,
}: {
    startTsUnix : number | null | undefined;
    lastEventAt : Date   | null | undefined;
    latencyMs   : number | null | undefined;
}) {
    const [, forceTick] = useState(0);
    useEffect(() => {
        const id = window.setInterval(() => forceTick((x) => x + 1), 1_000);
        return () => window.clearInterval(id);
    }, []);

    return (
        <>
            <InfoPill label="Duration"   value={formatDurationFromStart(startTsUnix)} />
            <InfoPill label="Last event" value={formatAgo(lastEventAt)} />
            <InfoPill label="Latency"    value={latencyMs != null ? `${latencyMs} ms` : "—"} />
        </>
    );
});


// --------------------------------------------------------------------------------
// Re-use AdminHeader props
// --------------------------------------------------------------------------------
export type SessionHeaderProps = {
    title        ? : string;
    sessionId    ? : number | string;
    username     ? : string;
    source       ? : string;
    mode         ? : "primary" | "listener" | "history";
    wsState        : ConnectionState;
    lastEventAt  ? : Date | null;
    latencyMs    ? : number | null;
    startTsUnix  ? : number | null;     // seconds since epoch
    messageCount ? : number | null;

    // Inactive chat page fields
    inactive_chat  : boolean;
    duration     ? : number | null;
};
