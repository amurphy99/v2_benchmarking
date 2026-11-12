/* Draw the robot's head: its silver shell, ear pads, and antennas.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/robot/render_2d/RobotShell2D`

Everything on the head except the screen and the face on it. The shell is
shaded like the smiley's face (bright at the top, its color through the middle,
a cool dark edge, and a soft sheen), plus a thin outline and a faint light along
the bottom edge, because silver stands out from a pale page far less than yellow
does. The ear pads and antennas are behind the shell, and each ear pad's end is
in front of it, showing only on the side that swings toward the viewer.

The antenna tips are lit in the robot's light color, as bright as the face's
`glow`.

*/
import type { ReactElement } from "react";
import      { useId        } from "react";

// From this project
import      { mixRgb, rgbString, verticalGradient  } from "@/pages/common/avatar/smiley/render_2d/gradients2D";
import type { FaceState, RGB                       } from "@/pages/common/avatar/smiley/state/faceState";
import        RobotAntenna2D                         from "./RobotAntenna2D";
import type { ShellShades                          } from "./robotColors";
import type { EarPadGeometry                       } from "./robotDrawing2D";
import      { earPadGeometry, headBox, ROBOT_EAR_R } from "./robotDrawing2D";
import      { ROBOT_HEAD_TOP, ROBOT_HEAD_W         } from "./robotDrawing2D";

// Outlines
const ROBOT_OUTLINE_W       = 1.4;    // Around the shell
const ROBOT_EAR_OUTLINE_W   = 1.2;    // Around each ear pad
const ROBOT_OUTLINE_OPACITY = 0.75;

// Sheen over the top of the shell (an ellipse that fades out toward its edges)
const ROBOT_SHEEN_DROP    = 26;     // Its center, below the head's top edge
const ROBOT_SHEEN_RX      = 0.38;   // Half-width, as a share of the head's width
const ROBOT_SHEEN_RY      = 24;
const ROBOT_SHEEN_HEX     = "#ffffff";
const ROBOT_SHEEN_OPACITY = 0.62;   // At its brightest

// Light along the bottom edge (a thin line just inside the outline, gone by `START` up the shell)
const ROBOT_RIM_INSET   = 3.5;
const ROBOT_RIM_W       = 3;
const ROBOT_RIM_HEX     = "#ffffff";
const ROBOT_RIM_OPACITY = 0.5;
const ROBOT_RIM_START   = "58%";

// Ear pads: corner rounding, and the hub on the end (its size as a share of the end's, and how dark it is)
const ROBOT_EAR_CORNER_R    = 5;
const ROBOT_EAR_HUB         = 0.42;
const ROBOT_EAR_HUB_OPACITY = 0.45;

// Antenna tips: the ball's color with its light off, the share of the light's color it keeps then, and the halo at full glow
const ROBOT_TIP_OFF_RGB      = [84, 92, 104] as const;
const ROBOT_TIP_OFF_SHARE    = 0.2;
const ROBOT_TIP_SHINE_MIX    = 0.75;   // How far the ball's lit spot mixes toward white
const ROBOT_TIP_SHADE        = 0.5;    // Share of every channel kept at the ball's dark edge
const ROBOT_TIP_HALO_OPACITY = 0.6;


// ================================================================================
// Robot Shell (2D)
// ================================================================================
// The head without its screen, in the head group's coordinates
export default function RobotShell2D({face, shades, lightRgb}: {
    face     : FaceState;     // Combined face for this frame
    shades   : ShellShades;   // The shell's color this frame, from its lit top to its outline
    lightRgb : RGB;           // The robot's light color this frame (the antenna tips)
}): ReactElement {
    // Gradient ids, unique per avatar on the page (React's ids may hold characters `url(#...)` rejects)
    const baseId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
    const id     = (name: string): string => `robot-shell-${name}-${baseId}`;
    const url    = (name: string): string => `url(#${id(name)})`;

    // --------------------------------------------------------------------------------
    // Colors and Shapes
    // --------------------------------------------------------------------------------
    // Shell shades as CSS colors (the ear pads are shaded from the same ones, top to bottom)
    const top  = rgbString(shades.top );
    const base = rgbString(shades.base);
    const edge = rgbString(shades.edge);
    const deep = rgbString(shades.deep);

    // Antenna tips: nearly dark with the light off, the light's color at full glow
    const tipRgb   : RGB = mixRgb([...ROBOT_TIP_OFF_RGB], lightRgb, ROBOT_TIP_OFF_SHARE + ((1 - ROBOT_TIP_OFF_SHARE) * face.glow));
    const tipShine : RGB = mixRgb(tipRgb, [255, 255, 255], ROBOT_TIP_SHINE_MIX);
    const tipShade : RGB = [tipRgb[0] * ROBOT_TIP_SHADE, tipRgb[1] * ROBOT_TIP_SHADE, tipRgb[2] * ROBOT_TIP_SHADE];

    // Both ear pads, turned with the head
    const ears: EarPadGeometry[] = [earPadGeometry(-1, face), earPadGeometry(1, face)];

    // --------------------------------------------------------------------------------
    // Render
    // --------------------------------------------------------------------------------
    return (
        <g>
            {/* -------------------------------------------------------------------------------- */}
            {/* Gradients */}
            {/* -------------------------------------------------------------------------------- */}
            <defs>
                {/* Shell: bright top, its color through the middle, a cool dark edge at the bottom */}
                <radialGradient id={id("shell")} cx="50%" cy="38%" r="66%" fx="50%" fy="14%">
                    <stop offset="0%"   stopColor={top}  />
                    <stop offset="46%"  stopColor={base} />
                    <stop offset="82%"  stopColor={edge} />
                    <stop offset="100%" stopColor={deep} />
                </radialGradient>
                <radialGradient id={id("sheen")} cx="50%" cy="30%" r="62%">
                    <stop offset="0%"   stopColor={ROBOT_SHEEN_HEX} stopOpacity={ROBOT_SHEEN_OPACITY} />
                    <stop offset="100%" stopColor={ROBOT_SHEEN_HEX} stopOpacity={0}                   />
                </radialGradient>
                <linearGradient id={id("rim")} x1="0" y1="0" x2="0" y2="1">
                    <stop offset={ROBOT_RIM_START} stopColor={ROBOT_RIM_HEX} stopOpacity={0}                 />
                    <stop offset="100%"            stopColor={ROBOT_RIM_HEX} stopOpacity={ROBOT_RIM_OPACITY} />
                </linearGradient>
                {verticalGradient(id("pad"), [top, base, deep])}

                {/* Antenna tips: a lit ball, and the halo of its light */}
                <radialGradient id={id("ball")} cx="36%" cy="30%" r="75%">
                    <stop offset="0%"   stopColor={rgbString(tipShine)} />
                    <stop offset="45%"  stopColor={rgbString(tipRgb)}   />
                    <stop offset="100%" stopColor={rgbString(tipShade)} />
                </radialGradient>
                <radialGradient id={id("halo")}>
                    <stop offset="0%"   stopColor={rgbString(lightRgb)} stopOpacity={ROBOT_TIP_HALO_OPACITY * face.glow} />
                    <stop offset="100%" stopColor={rgbString(lightRgb)} stopOpacity={0}                                  />
                </radialGradient>
            </defs>

            {/* -------------------------------------------------------------------------------- */}
            {/* Ear Pads and Antennas (behind the shell) */}
            {/* -------------------------------------------------------------------------------- */}
            {ears.map((ear: EarPadGeometry, i: number) => (
                <rect key={i} x={ear.x} y={ear.y} width={ear.width} height={2 * ROBOT_EAR_R} rx={ROBOT_EAR_CORNER_R} fill={url("pad")} stroke={deep} strokeWidth={ROBOT_EAR_OUTLINE_W} strokeOpacity={ROBOT_OUTLINE_OPACITY} />
            ))}
            <RobotAntenna2D side={-1} face={face} edge={deep} ball={url("ball")} halo={url("halo")} />
            <RobotAntenna2D side={ 1} face={face} edge={deep} ball={url("ball")} halo={url("halo")} />

            {/* -------------------------------------------------------------------------------- */}
            {/* Shell, Sheen, and Rim Light */}
            {/* -------------------------------------------------------------------------------- */}
            <rect {...headBox(0)} fill={url("shell")} stroke={deep} strokeWidth={ROBOT_OUTLINE_W} strokeOpacity={ROBOT_OUTLINE_OPACITY} />
            <ellipse cy={ROBOT_HEAD_TOP + ROBOT_SHEEN_DROP} rx={ROBOT_HEAD_W * ROBOT_SHEEN_RX} ry={ROBOT_SHEEN_RY} fill={url("sheen")} />
            <rect {...headBox(ROBOT_RIM_INSET)} fill="none" stroke={url("rim")} strokeWidth={ROBOT_RIM_W} />

            {/* -------------------------------------------------------------------------------- */}
            {/* Ear Pad Ends (in front of the shell) */}
            {/* -------------------------------------------------------------------------------- */}
            {ears.map((ear: EarPadGeometry, i: number) => (ear.endRx > 0) ? (
                <g key={i}>
                    <ellipse cx={ear.endX} cy={ear.endY} rx={ear.endRx}                 ry={ROBOT_EAR_R}                 fill={url("pad")} stroke={deep} strokeWidth={ROBOT_EAR_OUTLINE_W} strokeOpacity={ROBOT_OUTLINE_OPACITY} />
                    <ellipse cx={ear.endX} cy={ear.endY} rx={ear.endRx * ROBOT_EAR_HUB} ry={ROBOT_EAR_R * ROBOT_EAR_HUB} fill={deep} opacity={ROBOT_EAR_HUB_OPACITY} />
                </g>
            ) : null)}
        </g>
    );
}
