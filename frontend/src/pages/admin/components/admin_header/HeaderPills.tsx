/* HeaderPills.tsx
--------------------------------------------------------------------------------
Right section of the Admin header displays a set of "Pills" with information
about the status of the ChatSession. Each one gets updated in real time during
the chat.

*/
import { memo } from "react";

// From this project
import { ConnectionPill, LivePills, StreamStatusPill, type SessionHeaderProps } from "./StatusComponents";
import { Pill              } from "../ui/Pill";
import { formatElapsedTime } from "@/utils/styling/numFormatting";

// Type Definition (reusing the props from the full header)
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
            <Pill label="Messages" value={messageCount ?? "—"} />

            {/* Active-Inactive exclusive pills (live pills update every second) */}
            {inactive_chat ? (
                <Pill label="Duration" value={formatElapsedTime(duration)} />
            ) : (
                <LivePills startTsUnix={startTsUnix} lastEventAt={lastEventAt} latencyMs={latencyMs} streamStatus={streamStatus} />
            )}

            {/* Monitor connection status: admin's own WS connection to the backend */}
            <ConnectionPill wsState={wsState} label="Monitor" />
        </div>
    );
});
