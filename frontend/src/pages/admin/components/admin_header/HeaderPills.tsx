// HeaderPills.tsx
import { memo } from "react";

// From this project
import { ConnectionPill, LivePills, InfoPill, StreamStatusPill, type SessionHeaderProps, type StreamStatus } from "./StatusComponents";
import { formatElapsedTime } from "@/utils/styling/numFormatting";

// --------------------------------------------------------------------------------
// Type Definition (reusing the props from the full header)
// --------------------------------------------------------------------------------
type HeaderPillsProps = Pick<SessionHeaderProps,
    | "inactive_chat"
    | "wsState"
    | "startTsUnix"
    | "lastEventAt"
    | "latencyMs"
    | "duration"
    | "messageCount"
    | "streamStatus"
>;

// ================================================================================ 
// "StatusPills" for the AdminChat page headers 
// ================================================================================
export const HeaderPills = memo(function HeaderPills({
    wsState       = "offline",
    inactive_chat = false,
    startTsUnix   = null,
    lastEventAt   = null,
    latencyMs     = null,
    duration      = null,
    messageCount  = null,
    streamStatus,
}: HeaderPillsProps) {

    return (
        <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* User stream status: Active (green) | Paused (yellow) | Ended (red) */}
            {!inactive_chat && streamStatus && <StreamStatusPill status={streamStatus} label="User" />}

            {/* Shown for Active & Inactive chats */}
            <InfoPill label="Messages" value={messageCount ?? "—"} />

            {/* Active-Inactive exclusive pills (live pills update every second) */}
            {inactive_chat ? (
                <InfoPill label="Duration" value={formatElapsedTime(duration)} />
            ) : (
                <LivePills startTsUnix={startTsUnix} lastEventAt={lastEventAt} latencyMs={latencyMs} streamStatus={streamStatus} />
            )}

            {/* Monitor connection status: admin's own WS connection to the backend */}
            <ConnectionPill wsState={wsState} label="Monitor" />
        </div>
    );
});
