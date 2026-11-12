/* Gradient elements and color mixing shared by the 2D face renderers.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/render_2d/gradients2D`

The smiley's `SmileyFace2D` and the robot's `RobotFace2D` both shade their
shapes from a few colors mixed each frame, and fill their parts from SVG
gradients. The gradient helpers return elements for a renderer's `<defs>`.

*/
import type { ReactElement } from "react";

// From this project
import type { RGB } from "../state/faceState";


// --------------------------------------------------------------------------------
// Gradient Elements
// --------------------------------------------------------------------------------
// Top-to-bottom gradient across whatever shape uses it, through evenly spaced colors
export function verticalGradient(id: string, hexes: readonly string[]): ReactElement {
    return (
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            {hexes.map((hex: string, i: number) => <stop key={hex} offset={`${(100 * i) / (hexes.length - 1)}%`} stopColor={hex} />)}
        </linearGradient>
    );
}

// Overlay color strong over the top of a shape, holding most of its strength to 30%, then gone by `end`
export function topOverlayGradient(id: string, hex: string, end: string): ReactElement {
    return (
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor={hex} stopOpacity={1}   />
            <stop offset="30%" stopColor={hex} stopOpacity={0.8} />
            <stop offset={end} stopColor={hex} stopOpacity={0}   />
        </linearGradient>
    );
}


// --------------------------------------------------------------------------------
// Color Mixing
// --------------------------------------------------------------------------------
// Move `amount` of the way from one color to another
export function mixRgb([r, g, b]: RGB, [toR, toG, toB]: RGB, amount: number): RGB {
    return [r + ((toR - r) * amount), g + ((toG - g) * amount), b + ((toB - b) * amount)];
}

// CSS color for an RGB triple
export function rgbString([r, g, b]: RGB): string {
    return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;
}
