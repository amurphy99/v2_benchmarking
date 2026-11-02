/* Robot media state at a glance: connection, camera, head, input mode, and errors.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/robot_view/components/RobotStatePanel`

Experimental (see `backend/chat_app/websocket/experimental/buddy/README.md`).
Built for informal testing on the robot. Each card covers one part of the setup,
so a failure points to the robot, the backend, or this page. The full state and
capabilities Buddy sent are at the bottom as raw JSON.

*/
import type { ReactElement } from "react";

// From this project
import type { MediaSession, MediaStatus } from "../mediaFrames";
import      { formatValue, pathValue     } from "../mediaFrames";

// Input mode the primary chat socket reported (null until the robot's probe)
export type InputModeState = {
    mode     : string;
    revision : number;
};

// One titled card of label and value rows
type StateCard = {
    title : string;
    rows  : [string, string][];
};


// ================================================================================
// Robot State Panel
// ================================================================================
// Cards of connection, camera, head, and error state, then the raw JSON
export default function RobotStatePanel({connected, latencyMs, session, status, inputMode}: {
    // This page's viewer socket
    connected : boolean;         // Viewer socket is open
    latencyMs : number | null;   // Round trip to the backend

    // Robot media and chat state
    session   : MediaSession;              // Robot media socket's lifecycle
    status    : MediaStatus    | null;     // Newest robot state and capabilities
    inputMode : InputModeState | null;     // From the primary chat socket's control state
}): ReactElement {
    const state        = (status !== null) ? status.state        : null;
    const capabilities = (status !== null) ? status.capabilities : null;

    // One robot-state value by path, ready to show
    const at = (...keys: string[]): string => formatValue(pathValue(state, ...keys));

    // --------------------------------------------------------------------------------
    // Cards
    // --------------------------------------------------------------------------------
    const cards: StateCard[] = [
        {
            title : "Connections",
            rows  : [
                ["Viewer socket", connected ? `open (${(latencyMs !== null) ? `${latencyMs} ms` : "—"})` : "closed"],
                ["Robot media",   session.status                                                                  ],
                ["Media session", formatValue(session.media_session_id)                                           ],
                ["Input mode",    (inputMode !== null) ? `${inputMode.mode} (revision ${inputMode.revision})` : "not reported yet"],
            ],
        },
        {
            title : "Camera",
            rows  : [
                ["FPS requested / effective / measured", `${at("video", "requested_fps")} / ${at("video", "effective_fps")} / ${at("video", "measured_fps")}`],
                ["Size",                                 `${at("video", "width")} × ${at("video", "height")}`                                                ],
                ["Frames sent / dropped",                `${at("video", "frames_sent")} / ${at("video", "frames_dropped")}`                                  ],
            ],
        },
        {
            title : "Head",
            rows  : [
                ["Available / busy", `${at("head", "available")} / ${at("head", "busy")}`  ],
                ["Pitch / yaw (°)",  `${at("head", "pitch_deg")} / ${at("head", "yaw_deg")}`],
                ["Pose age (ms)",    at("head", "pose_age_ms")                              ],
                ["Fault",            at("head", "fault")                                    ],
            ],
        },
        {
            title : "Errors",
            rows  : [
                ["Robot's last error", at("last_error")],
            ],
        },
    ];

    // --------------------------------------------------------------------------------
    // Render
    // --------------------------------------------------------------------------------
    return (
        <div className="flex flex-col gap-3">
            {cards.map(({title, rows}: StateCard): ReactElement => (
                <section key={title} className="rounded-xl border border-admin-border bg-admin-panel shadow-sm overflow-hidden">
                    <header className="px-3 py-2 border-b border-admin-border text-sm font-semibold text-admin-text">{title}</header>
                    <div className="px-3 py-2">
                        {rows.map(([label, value]: [string, string]): ReactElement => (
                            <div key={label} className="flex items-baseline justify-between gap-3 py-0.5 text-xs">
                                <span className="text-admin-subtext">{label}</span>
                                <span className="text-admin-text font-mono text-right break-all">{value}</span>
                            </div>
                        ))}
                    </div>
                </section>
            ))}

            {/* Raw JSON the robot sent */}
            <section className="rounded-xl border border-admin-border bg-admin-panel shadow-sm px-3 py-2 text-xs">
                <details>
                    <summary className="cursor-pointer text-admin-subtext">Raw state</summary>
                    <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-admin-text">{JSON.stringify(state, null, 2)}</pre>
                </details>
                <details className="mt-2">
                    <summary className="cursor-pointer text-admin-subtext">Raw capabilities</summary>
                    <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-admin-text">{JSON.stringify(capabilities, null, 2)}</pre>
                </details>
            </section>
        </div>
    );
}
