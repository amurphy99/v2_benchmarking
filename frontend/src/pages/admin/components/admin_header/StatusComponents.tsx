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

export const ConnectionPill = memo(function ConnPill({ wsState, label }: { wsState: ConnectionState; label?: string }) {
    const badge = useMemo(() => connBadge(wsState), [wsState]);
    return (
        <div className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${badge.pill}`}>
            {label && <span className="opacity-60 font-normal">{label}</span>}
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
    streamStatus = "active",
}: {
    startTsUnix  : number | null | undefined;
    lastEventAt  : Date   | null | undefined;
    latencyMs    : number | null | undefined;
    streamStatus?: StreamStatus;
}) {
    const [, forceTick] = useState(0);
    const [frozenAt, setFrozenAt] = useState<number | null>(null);

    // Always tick every second so "last event" stays live even when paused
    useEffect(() => {
        const id = window.setInterval(() => forceTick((x) => x + 1), 1_000);
        return () => window.clearInterval(id);
    }, []);

    // Freeze/unfreeze the duration counter based on stream status.
    // Capture the current time once; don't override if already frozen
    // (e.g. going from "paused" to "ended"; keep the time from when it was paused).
    useEffect(() => {
        if (streamStatus === "active") { setFrozenAt(null); } 
        else                           { setFrozenAt((prev) => prev ?? Math.floor(Date.now() / 1_000)); }
    }, [streamStatus]);

    const durationValue = frozenAt != null && startTsUnix != null
        ? formatElapsedTime(Math.max(0, frozenAt - startTsUnix))
        : formatDurationFromStart(startTsUnix);

    const lastEventLabel = streamStatus === "ended" ? "Chat ended" : "Last event";

    return (
        <>
            <InfoPill label="Duration"       value={durationValue} />
            <InfoPill label={lastEventLabel} value={formatAgo(lastEventAt)} />
            <InfoPill label="Latency"        value={latencyMs != null ? `${latencyMs} ms` : "—"} />
        </>
    );
});


// --------------------------------------------------------------------------------
// Stream Status Indicator (user's chat state: active | paused | ended)
// --------------------------------------------------------------------------------
export type StreamStatus = "active" | "paused" | "ended";

function streamBadge(status: StreamStatus) {
    switch (status) {
        case "active" : return { text: "Active",  dot: "bg-green-500",  pill: "bg-green-50  text-green-700  border-green-200"  };
        case "paused" : return { text: "Paused",  dot: "bg-yellow-400", pill: "bg-yellow-50 text-yellow-700 border-yellow-200" };
        case "ended"  :
        default:        return { text: "Ended",   dot: "bg-red-500",    pill: "bg-red-50    text-red-700    border-red-200"    };
    }
}

export const StreamStatusPill = memo(function StreamStatusPill({ status, label }: { status: StreamStatus; label?: string }) {
    const badge = useMemo(() => streamBadge(status), [status]);
    return (
        <div className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${badge.pill}`}>
            {label && <span className="opacity-60 font-normal">{label}</span>}
            <span className={`h-2 w-2 rounded-full ${badge.dot}`} />
            <span className="font-medium">{badge.text}</span>
        </div>
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
    streamStatus ? : StreamStatus;

    // Inactive chat page fields
    inactive_chat  : boolean;
    duration     ? : number | null;
};
