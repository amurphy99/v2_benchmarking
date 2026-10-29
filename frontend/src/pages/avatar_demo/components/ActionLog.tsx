/* Recent actions the avatar demo page sent, and whether each is still showing.
--------------------------------------------------------------------------------
`@frontend/src/pages/avatar_demo/components/ActionLog`

*/
import type { ReactElement        } from "react";
import      { useEffect, useState } from "react";

// From this project
import      { buttonSectionHeader, groupDivStyle } from "@/hooks/chat-listener/chat-controls/styles";
import type { RobotAction                        } from "@/pages/common/avatar/avatarRegistry";

// How often hold countdowns refresh
const DEMO_LOG_TICK_MS = 200;

// One sent action, with a log id, when it was sent, and its strength (`kind: "reset"` marks the Reset button)
export type LoggedAction = RobotAction & {id: number; sentAt: number; strength: number};


// --------------------------------------------------------------------------------
// Action Log
// --------------------------------------------------------------------------------
// List sent actions newest first, with a live countdown for a timed emotion
export default function ActionLog({log}: {
    log : LoggedAction[];   // Sent actions, newest first
}): ReactElement {
    // Re-render a few times a second so countdowns stay current
    const [nowMs, setNowMs] = useState<number>(Date.now());
    useEffect(() => {
        const timer = window.setInterval(() => setNowMs(Date.now()), DEMO_LOG_TICK_MS);
        return () => window.clearInterval(timer);
    }, []);

    // Only the newest emotion can still be showing (a later emotion or a reset replaced the rest)
    const latestMoodId = log.find((entry: LoggedAction) => (entry.kind === "emotion") || (entry.kind === "reset"))?.id;

    return (
        <div className={groupDivStyle}>
            <div className={buttonSectionHeader}>Sent Actions</div>
            {(log.length === 0) ? (
                <div className="mt-2 text-sm opacity-60">Nothing sent yet.</div>
            ) : (
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                    {log.map((entry: LoggedAction) => (
                        <li key={entry.id} className="flex items-baseline justify-between gap-3">
                            <span>
                                <span className="font-mono text-xs opacity-60">{new Date(entry.sentAt).toLocaleTimeString([], {hour12: false})}</span>
                                {" "}<b>{entry.value}</b>{" "}<span className="opacity-60">({entry.kind}){((entry.kind === "emotion") && (entry.strength < 1)) ? ` at ${Math.round(entry.strength * 100)}%` : ""}</span>
                            </span>
                            <span className="text-right text-xs opacity-70">{actionStatus(entry, entry.id === latestMoodId, nowMs)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// Describe where one sent action stands now
function actionStatus(entry: LoggedAction, isLatestMood: boolean, nowMs: number): string {
    if (entry.kind === "reset")   return "back to Neutral";
    if (entry.kind !== "emotion") return "plays once";
    if (!isLatestMood)            return "replaced";

    // The newest emotion either holds or counts down to Neutral
    const durationMs = entry.duration_ms ?? null;
    if (durationMs === null) return "holding";
    const remainingMs = (entry.sentAt + durationMs) - nowMs;
    return (remainingMs > 0) ? `Neutral in ${(remainingMs / 1_000).toFixed(1)}s` : "back to Neutral";
}
