/* The robot's own colors, and how an emotion tints them.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/robot/render_2d/robotColors`

The robot has two colors of its own: the silver of its shell, and one light
color for the face on its screen and its antenna tips. Change either here and
every part follows, since the shading, the glow, the hands, and the eyes are all
mixed from these two each frame.

An emotion that colors the smiley's whole face (angry, cold, sick) tints the
robot instead: its lights take the emotion's color, and its shell only a little
of it. `faceTint` says how much of the face state's `faceRgb` is such a color.

*/
import      { mixRgb           } from "@/pages/common/avatar/smiley/render_2d/gradients2D";
import type { FaceState, RGB   } from "@/pages/common/avatar/smiley/state/faceState";
import      { SMILEY_BASE_FACE } from "@/pages/common/avatar/smiley/state/faceState";

// Shell: silver, shaded like the smiley's face (the edge keeps a cool share of each red, green, and blue channel)
const ROBOT_SHELL_RGB      = [200, 206, 216] as const;
const ROBOT_SHELL_TOP_MIX  = 0.72;                         // How far the top of the shell mixes toward white
const ROBOT_SHELL_EDGE     = [0.60, 0.64, 0.71] as const;  // Channel shares kept at the edge
const ROBOT_SHELL_DEEP_RGB = [8, 12, 22] as const;         // Outline color the edge darkens toward
const ROBOT_SHELL_DEEP_MIX = 0.3;
const ROBOT_SHELL_TINT     = 0.2;                          // Share of an emotion's color the shell takes

// Lights: the face on the screen and the antenna tips (lilac)
const ROBOT_LIGHT_RGB = [192, 170, 255] as const;


// --------------------------------------------------------------------------------
// Color Types
// --------------------------------------------------------------------------------
// Shades of the shell's color, from its lit top to its outline
export type ShellShades = {top: RGB; base: RGB; edge: RGB; deep: RGB};

// The robot's colors for one frame
export type RobotColors = {
    light : RGB;           // The face on the screen and the antenna tips
    shell : ShellShades;   // The shell, ear pads, and hands
};


// --------------------------------------------------------------------------------
// Robot Colors
// --------------------------------------------------------------------------------
// This frame's colors: the robot's own, with the face's emotion color mixed in
export function robotColors(face: FaceState): RobotColors {
    // The lights take all of an emotion's color, the shell a little
    const light = tintedRgb(ROBOT_LIGHT_RGB, face, 1);
    const base  = tintedRgb(ROBOT_SHELL_RGB, face, ROBOT_SHELL_TINT);

    // Shell shading: a near-white top, and a cool edge darkening to the outline color
    const edge: RGB = [base[0] * ROBOT_SHELL_EDGE[0], base[1] * ROBOT_SHELL_EDGE[1], base[2] * ROBOT_SHELL_EDGE[2]];
    return {
        light : light,
        shell : {
            top  : mixRgb(base, [255, 255, 255], ROBOT_SHELL_TOP_MIX),
            base : base,
            edge : edge,
            deep : mixRgb(edge, [...ROBOT_SHELL_DEEP_RGB], ROBOT_SHELL_DEEP_MIX),
        },
    };
}

// One of the robot's own colors with `share` of the face's emotion color mixed in
function tintedRgb(own: readonly [number, number, number], face: FaceState, share: number): RGB {
    /*
    An emotion's face moves `faceRgb` from the face's own yellow toward its color while
    `faceTint` goes from 0 to 1, so its color is yellow + (faceRgb - yellow) / faceTint.
    Mixing that into `own` by `faceTint * share` cancels the division, which leaves this.
    */
    const yellow  = SMILEY_BASE_FACE.faceRgb;
    const channel = (i: number): number => own[i] + (share * ((face.faceRgb[i] - yellow[i]) + (face.faceTint * (yellow[i] - own[i]))));
    return [channel(0), channel(1), channel(2)];
}
