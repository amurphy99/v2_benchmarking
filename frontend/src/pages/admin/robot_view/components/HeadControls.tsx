/* Look buttons for the robot's head, with its pose and last answer.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/robot_view/components/HeadControls`

Experimental (see `backend/chat_app/websocket/experimental/buddy/README.md`).
Each button sends one `move_head`. Buddy turns to a fixed angle (up and down are
pitch +15° and −15°, left and right are yaw −30° and +30°, center is both 0) at
10°/s, one move at a time. The buttons wait for Buddy's ack and then show what it
said, such as "Head is busy" when an earlier move was still running. The angle
signs are not yet checked on the robot.

*/
import type { ReactElement } from "react";

// From this project
import      { btnClass                                } from "@/hooks/chat-listener/chat-controls/styles";
import type { HeadDirection, MediaSession, RobotState } from "../mediaFrames";
import      { formatValue                             } from "../mediaFrames";
import type { HeadMoveState                           } from "../useMediaViewer";

// Look pad, row by row (null cells stay empty)
const HEAD_PAD: (HeadDirection | null)[] = [
    null,   "up",     null,
    "left", "center", "right",
    null,   "down",   null,
];

// Button text for each direction
const HEAD_LABEL: Record<HeadDirection, string> = {
    up     : "↑ Up",
    down   : "↓ Down",
    left   : "← Left",
    right  : "Right →",
    center : "Center",
};


// ================================================================================
// Head Controls
// ================================================================================
// Five look buttons, the pose Buddy last reported, and its answer to the last move
export default function HeadControls({connected, session, robotState, headMove, onMove}: {
    // Whether a move can go out
    connected : boolean;        // Viewer socket is open
    session   : MediaSession;   // Moves go to Buddy's media socket, so Video must be on

    // What Buddy reported
    robotState : RobotState | null;   // Newest state (pose and busy flag)
    headMove   : HeadMoveState;       // Move waiting for its ack, and the last answer

    // Sending
    onMove : (direction: HeadDirection) => void;
}): ReactElement {
    const disabled = !connected || (session.status !== "ready") || (headMove.pending !== null);
    const head     = robotState?.head;

    // Buddy's answer to the last move (an accepted move has only started; a refusal says why)
    const last     = headMove.last;
    const lastMove = (last === null) ? "—" : `${last.direction}: ${last.ok ? "started" : last.message}`;

    // Pose rows, read from Buddy's newest state
    const rows: [string, string][] = [
        ["Available / busy", `${formatValue(head?.available)} / ${formatValue(head?.busy   )}`],
        ["Pitch / yaw (°)",  `${formatValue(head?.pitch_deg)} / ${formatValue(head?.yaw_deg)}`],
        ["Last move",        lastMove                                                         ],
    ];

    return (
        <section className="rounded-xl border border-admin-border bg-admin-panel shadow-sm overflow-hidden">
            <header className="px-3 py-2 border-b border-admin-border text-sm font-semibold text-admin-text">Head</header>

            {/* Look pad: up on top, then left / center / right, then down */}
            <div className="px-3 pt-3 mx-auto max-w-[300px] grid grid-cols-3 gap-2">
                {HEAD_PAD.map((direction: HeadDirection | null, index: number): ReactElement => (direction === null) ? <div key={index} /> : (
                    <button
                        key       = {direction}
                        type      = "button"
                        className = {btnClass(disabled, "secondary")}
                        disabled  = {disabled}
                        onClick   = {(): void => onMove(direction)}
                    >
                        {(headMove.pending === direction) ? "Sending…" : HEAD_LABEL[direction]}
                    </button>
                ))}
            </div>

            {/* Pose and the last answer */}
            <div className="px-3 py-2">
                {rows.map(([label, value]: [string, string]): ReactElement => (
                    <div key={label} className="flex items-baseline justify-between gap-3 py-0.5 text-xs">
                        <span className="text-admin-subtext">{label}</span>
                        <span className="text-admin-text font-mono text-right break-all">{value}</span>
                    </div>
                ))}
            </div>
        </section>
    );
}
