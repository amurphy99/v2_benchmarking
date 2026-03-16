// HeaderPills.tsx
import { memo } from "react";

// From this project
import { ConnectionPill, LivePills, InfoPill, type SessionHeaderProps } from "./StatusComponents";
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
}: HeaderPillsProps) {

    return (
        <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Indicator: Connected | Disconnected | Offline */}
            <ConnectionPill wsState={wsState} />

            {/* Shown for Active & Inactive chats */}
            <InfoPill label="Messages" value={messageCount ?? "—"} />

            {/* Active-Inactive exclusive pills (live pills update every second) */}
            {inactive_chat ? (
                <InfoPill label="Duration" value={formatElapsedTime(duration)} />
            ) : (
                <LivePills startTsUnix={startTsUnix} lastEventAt={lastEventAt} latencyMs={latencyMs} />
            )}
        </div>
    );
});
