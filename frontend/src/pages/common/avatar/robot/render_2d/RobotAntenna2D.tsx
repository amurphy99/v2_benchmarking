/* Draw one of the robot's antennas: a thin stalk with a lit ball at its tip.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/robot/render_2d/RobotAntenna2D`

The stalk's shape comes from `antennaGeometry`, which turns it with the head,
stretches or droops it, and bends it by how far its tip trails. The ball and
the halo around it are filled from `RobotShell2D`'s gradients, which carry the
light's color and brightness.

*/
import type { ReactElement } from "react";

// From this project
import type { FaceState       } from "@/pages/common/avatar/smiley/state/faceState";
import      { antennaGeometry } from "./robotDrawing2D";

// Stalk: its width, and the thin highlight down its left side
const ROBOT_STALK_W             = 4;
const ROBOT_STALK_SHINE_W       = 1.2;
const ROBOT_STALK_SHINE_SHIFT   = -0.8;
const ROBOT_STALK_SHINE_HEX     = "#ffffff";
const ROBOT_STALK_SHINE_OPACITY = 0.5;

// Ball at the tip, and the halo of its light (as a multiple of the ball's radius)
const ROBOT_BALL_R      = 7;
const ROBOT_BALL_EDGE_W = 0.9;
const ROBOT_HALO_REACH  = 2.7;


// --------------------------------------------------------------------------------
// Robot Antenna (2D)
// --------------------------------------------------------------------------------
// One antenna, in the head group's coordinates
export default function RobotAntenna2D({side, face, edge, ball, halo}: {
    side : number;      // -1 for the left antenna, 1 for the right
    face : FaceState;   // Combined face for this frame
    edge : string;      // Stalk and ball outline color
    ball : string;      // Ball fill
    halo : string;      // Halo fill (fades to nothing at its edge)
}): ReactElement {
    const antenna = antennaGeometry(side, face);
    return (
        <g fill="none" strokeLinecap="round">
            <path d={antenna.stalk} stroke={edge} strokeWidth={ROBOT_STALK_W} />
            <path d={antenna.stalk} stroke={ROBOT_STALK_SHINE_HEX} strokeWidth={ROBOT_STALK_SHINE_W} opacity={ROBOT_STALK_SHINE_OPACITY} transform={`translate(${ROBOT_STALK_SHINE_SHIFT} 0)`} />
            <circle cx={antenna.tipX} cy={antenna.tipY} r={ROBOT_BALL_R * ROBOT_HALO_REACH} fill={halo} />
            <circle cx={antenna.tipX} cy={antenna.tipY} r={ROBOT_BALL_R} fill={ball} stroke={edge} strokeWidth={ROBOT_BALL_EDGE_W} />
        </g>
    );
}
