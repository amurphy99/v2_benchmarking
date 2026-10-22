/* Square pad for pointing an avatar's gaze by clicking or dragging.
--------------------------------------------------------------------------------
`@frontend/src/pages/avatar_demo/components/GazePad`

*/
import type { PointerEvent, ReactElement } from "react";

// A gaze point, -1 to 1 on each axis (y grows downward, matching the avatar's gaze)
export type GazePoint = {x: number; y: number};


// --------------------------------------------------------------------------------
// Gaze Pad
// --------------------------------------------------------------------------------
// Report the pointer's spot on the pad as a gaze point, and mark the current one
export default function GazePad({point, onGaze}: {
    point  : GazePoint | null;                // Gaze the page set last (null while gaze is automatic)
    onGaze : (x: number, y: number) => void;  // Called with each new point
}): ReactElement {
    // Pointer position as a gaze point (a drag can leave the pad, so keep it on the edge)
    const gazeFromPointer = (event: PointerEvent<HTMLDivElement>): void => {
        const box   = event.currentTarget.getBoundingClientRect();
        const clamp = (value: number): number => Math.max(-1, Math.min(1, value));
        onGaze(clamp((((event.clientX - box.left) / box.width) * 2) - 1), clamp((((event.clientY - box.top) / box.height) * 2) - 1));
    };

    // Capture the pointer on press so a drag keeps reporting
    const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => { event.currentTarget.setPointerCapture(event.pointerId); gazeFromPointer(event); };
    const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => { if (event.currentTarget.hasPointerCapture(event.pointerId)) gazeFromPointer(event); };

    return (
        <div
            className     = "relative h-36 w-36 shrink-0 cursor-crosshair touch-none rounded-lg border border-admin-border bg-admin-muted2"
            onPointerDown = {onPointerDown}
            onPointerMove = {onPointerMove}
        >
            {/* Crosshair through the center */}
            <div className="absolute left-1/2 top-0 h-full w-px bg-admin-border" />
            <div className="absolute left-0 top-1/2 h-px w-full bg-admin-border" />

            {/* Current point */}
            {(point !== null) ? (
                <div
                    className = "absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-admin-accent"
                    style     = {{left: `${(point.x + 1) * 50}%`, top: `${(point.y + 1) * 50}%`}}
                />
            ) : null}
        </div>
    );
}
