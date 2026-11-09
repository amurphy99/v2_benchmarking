/* The memory activity's debug log: every turn, with the activity's scenario.
--------------------------------------------------------------------------------
`@frontend/src/pages/chat/components/ActivityDebugPanel`

Added for testing the memory activity, and kept as it was: each user and
assistant turn, with the scenario the activity's reply reported (`state`).

*/
import type { ReactElement } from "react";

// One turn in the log
export type DebugTurn = {
    ts     : number;                  // When it arrived (ms)
    role   : "user" | "assistant";
    text   : string;
    state ?: string;                  // The activity's scenario, on its replies
};


// ================================================================================
// Activity Debug Panel
// ================================================================================
// Every turn so far, oldest first
export default function ActivityDebugPanel({turns}: {
    turns : DebugTurn[];  // The turns so far
}): ReactElement {
    return (
        <div className="max-h-[70vh] overflow-y-auto rounded-2xl border border-chat-border bg-chat-panel p-5 shadow-sm">
            <div className="mb-3 font-semibold text-chat-text">Memory Activity Debug (testing)</div>
            {turns.map((turn: DebugTurn) => (
                <div key={turn.ts} className="mb-3">
                    <div className="text-xs text-chat-subtext">{turn.role}{turn.state ? ` · state: ${turn.state}` : ""}</div>
                    <div className="whitespace-pre-wrap text-sm text-chat-text">{turn.text}</div>
                </div>
            ))}
        </div>
    );
}
