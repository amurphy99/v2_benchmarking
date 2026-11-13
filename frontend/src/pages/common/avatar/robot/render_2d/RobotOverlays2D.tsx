/* Draw the looks that cover the robot's shell: fear shading, frost, icicles.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/robot/render_2d/RobotOverlays2D`

These are the smiley's own looks, fitted to the robot's head: a faint blue
shade over the top of the shell (fearful), or frost with a thin dark-blue rim
along the top edge, and icicles hanging under the head (cold). Each shows by
its amount in the face state.

`RobotFace2D` draws them over the shell and under the screen, so the screen's
frame cuts them off cleanly. The glass is a different material and shows the
same looks its own way (`RobotGlass2D`): a blue shade down the glass, and frost
creeping in from its edges.

*/
import type { ReactElement } from "react";
import      { useId        } from "react";

// From this project
import      { topOverlayGradient          } from "@/pages/common/avatar/smiley/render_2d/gradients2D";
import type { FaceState                   } from "@/pages/common/avatar/smiley/state/faceState";
import      { headBox, ROBOT_ICICLE_PATHS } from "./robotDrawing2D";

// Shading and frost over the top of the head (each is strong at the very top and gone by `*_END`)
const ROBOT_FEAR_HEX     = "#6f86ff";   // Fearful blue
const ROBOT_FEAR_END     = "50%";
const ROBOT_FEAR_OPACITY = 0.3;         // At a full `fearShade` (faint: the glass carries most of the look)
const ROBOT_FROST_HEX    = "#f4fbff";   // Cold-face frost
const ROBOT_FROST_END    = "38%";

// Cold-face rim: a thin dark-blue outline along the top edge, over the frost (it fades out by `END`)
const ROBOT_COLD_RIM_HEX = "#2b5f9e";
const ROBOT_COLD_RIM_W   = 2.5;
const ROBOT_COLD_RIM_END = "60%";


// --------------------------------------------------------------------------------
// Robot Overlays (2D)
// --------------------------------------------------------------------------------
// Fear shading, frost, and icicles on the shell, in the head group's coordinates
export default function RobotOverlays2D({face, ice}: {
    face : FaceState;   // Combined face for this frame
    ice  : string;      // Icicle fill
}): ReactElement {
    // Gradient ids, unique per avatar on the page (React's ids may hold characters `url(#...)` rejects)
    const baseId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
    const id     = (name: string): string => `robot-overlay-${name}-${baseId}`;
    const url    = (name: string): string => `url(#${id(name)})`;

    return (
        <g>
            <defs>
                {topOverlayGradient(id("fear"),  ROBOT_FEAR_HEX,     ROBOT_FEAR_END    )}
                {topOverlayGradient(id("frost"), ROBOT_FROST_HEX,    ROBOT_FROST_END   )}
                {topOverlayGradient(id("rim"),   ROBOT_COLD_RIM_HEX, ROBOT_COLD_RIM_END)}
            </defs>

            {/* Shading and frost over the top of the head, and the cold rim along its top edge */}
            {(face.fearShade > 0) ? <rect {...headBox(0)} fill={url("fear")}  opacity={face.fearShade * ROBOT_FEAR_OPACITY} /> : null}
            {(face.frost     > 0) ? <rect {...headBox(0)} fill={url("frost")} opacity={face.frost}                          /> : null}
            {(face.frost     > 0) ? <rect {...headBox(ROBOT_COLD_RIM_W / 2)} fill="none" stroke={url("rim")} strokeWidth={ROBOT_COLD_RIM_W} opacity={face.frost} /> : null}

            {/* Icicles hanging under the head */}
            {(face.icicles > 0) ? (
                <g fill={ice} opacity={face.icicles}>
                    {ROBOT_ICICLE_PATHS.map((icicle: string, i: number) => <path key={i} d={icicle} />)}
                </g>
            ) : null}
        </g>
    );
}
