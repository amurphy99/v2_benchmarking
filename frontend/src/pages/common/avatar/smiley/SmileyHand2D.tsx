/* Draw the smiley's hand poses: a hand held over the mouth, and a hand on the chin.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/SmileyHand2D`

Each pose is an emoji-style hand drawn as one outlined silhouette, so the fingers
belong to the hand instead of being separate pieces:

  - over the mouth: the back of a raised hand (fingers together, thumb out to
    the side), like ✋. Used by 🤭, 🫢, and 🥱.
  - on the chin: the back of a hand with the index finger raised, the other
    fingers curled, and the thumb out to the side, like ☝️. Used by 🤔.

Drawing order: a soft shadow on the face, then every part (the raised hand's
thumb and the hand itself) stroked at twice the outline width, then every part
filled again with no stroke. The second fill covers the inner half of each
outline, so the parts join into one silhouette with no line where the thumb
meets the palm. Crease lines where fingers meet go on top.

Each pose is lit from the top of the screen, like the head: its gradient runs
straight down the screen across the hand's height at the angle it is drawn at
(the face's lean plus its own), measured from the shape's outline box, so a
tilted hand is still lighter on top. Its shadow on the face falls straight down
the screen too.

Placement, size, and angle are the constants under "Pose Placement"; the shapes
themselves are in each pose's local coordinates (fingers pointing up, roughly
centered on the origin). A pose fades in by its amount in the face state and
rises into place as it does, and `handDX`, `handDY`, and `handTilt` nudge it
per expression.

*/
import type { ReactElement } from "react";
import      { useId        } from "react";

// From this project
import type { Point, SmileyPaint } from "./faceDrawing2D";
import      { SMILEY_MOUTH_Y      } from "./faceDrawing2D";
import type { FaceState           } from "./faceState";

// One hand pose's paths, in its local coordinates
type HandShape = {
    behind  : string;                             // Extra closed part joined to the silhouette, like a thumb ("" for none)
    body    : string;                             // The hand's main closed shape
    creases : string;                             // Lines where fingers meet ("" for none)
    bounds  : [number, number, number, number];   // Outline box (left, top, right, bottom), measured with `getBBox`
};

// Back of a raised hand: fingers together and pointing up, thumb out to the left (✋)
const SMILEY_RAISED_HAND: HandShape = {
    behind  : "M -19 14 C -27 9 -32 0 -32.5 -8 A 5 5 0 0 1 -23 -11 C -21 -4 -18 1 -14 4 Z",
    body    : "M -21.3 16 L -21.3 -34.2 A 5.8 5.8 0 0 1 -9.7 -34.2 L -10 -38 A 6 6 0 0 1 2 -38 L 1.7 -35.2 A 5.8 5.8 0 0 1 13.3 -35.2 L 12.8 -27.8 A 5.2 5.2 0 0 1 23.2 -27.8 "
            + "L 24 -6 C 26 4 26 16 20 24 C 14 30 -14 30 -19 24 C -22 21 -21.3 20 -21.3 16 Z",
    creases : "M -9.8 -33 L -9.8 -16 M 1.8 -34 L 1.8 -16 M 12.9 -26 L 12.9 -12",
    bounds  : [-32.6, -44, 25.2, 28.5],
};

// Back of a hand with the index finger raised, the other fingers curled, and the thumb out to the left (☝️;
// outline from the Bootstrap Icons "hand-index-thumb" icon, MIT license, scaled up and centered on the fist)
const SMILEY_POINTING_HAND: HandShape = {
    behind  : "",
    body    : "M 0 -25.3 L 0 -35.1 A 6.3 6.3 0 1 0 -12.6 -35.1 L -12.6 -11.5 L -18.2 -17.2 A 5.5 5.5 0 0 0 -26.7 -10.5 L -17.8 4.5 L -13.4 13.2 A 5.4 5.4 0 0 0 -8.6 16.2 L 14.1 16.2 A 5.4 5.4 0 0 0 18.8 13.5 L 23.8 4.7 A 12.6 12.6 0 0 0 25.4 -0.3 L 26.4 -10.1 A 7.2 7.2 0 0 0 19.2 -18 L 17.1 -18 A 18.4 18.4 0 0 0 16.4 -18.9 C 15.8 -19.7 14.6 -20.9 13.3 -21.5 C 12 -22 10.2 -21.9 9.1 -21.9 L 8.6 -21.8 "
            + "A 4.5 4.5 0 0 0 6.6 -24.1 A 9.5 9.5 0 0 0 4 -25.2 C 2.8 -25.4 1.3 -25.4 0.2 -25.3 Z",
    creases : "M 0 -24.5 L 0 -17.6 M 7.2 -22.7 L 7.2 -15.8 M 16.2 -17.6 L 16.2 -11.2 M -12.6 -11.5 L -11.2 -7.6",
    bounds  : [-27.3, -41.4, 26.4, 16.2],
};

// Line widths
const SMILEY_HAND_EDGE_W   = 1.6;   // Outline around the hand
const SMILEY_HAND_CREASE_W = 1.5;   // Finger creases

// Shading reaches this share of the hand's height past its top and bottom (so neither end is the shading's palest or deepest)
const SMILEY_HAND_SHADE_PAD = 0.1;

// Soft shadow of the hand on the face, offset on the screen (down and a little right)
const SMILEY_HAND_SHADOW_X       = 1.5;
const SMILEY_HAND_SHADOW_Y       = 3.5;
const SMILEY_HAND_SHADOW_HEX     = "#000000";
const SMILEY_HAND_SHADOW_OPACITY = 0.12;


// --------------------------------------------------------------------------------
// Pose Placement
// --------------------------------------------------------------------------------
// Size of both poses, and how far a pose rises into place while fading in
const SMILEY_HAND_SCALE = 1.3;
const SMILEY_HAND_SLIDE = 18;

// Hand over the mouth: centered on the mouth, fingers leaning up and to the left
const SMILEY_MOUTH_HAND_X        = 0;
const SMILEY_MOUTH_HAND_Y        = SMILEY_MOUTH_Y;
const SMILEY_MOUTH_HAND_TILT_DEG = -30;

// Hand on the chin: fist at the left side of the chin, index finger leaning toward the cheek
const SMILEY_CHIN_HAND_X        = -34;
const SMILEY_CHIN_HAND_Y        = 82;
const SMILEY_CHIN_HAND_TILT_DEG = -15;


// ================================================================================
// Smiley Hand (2D)
// ================================================================================
// Both hand poses, in the feature group's coordinates (each one is hidden at zero)
export default function SmileyHand2D({face, paint}: {
    face  : FaceState;     // Combined face for this frame
    paint : SmileyPaint;   // Fills and hand shading colors from `SmileyFace2D`
}): ReactElement {
    // Gradient ids, unique per avatar on the page (React's ids may hold characters `url(#...)` rejects)
    const baseId = useId().replace(/[^a-zA-Z0-9_-]/g, "");

    // Place a pose at its spot plus the face's nudges, rising into place as it fades in
    const placed = (amount: number, x: number, y: number, tiltDeg: number): string =>
        `translate(${x + face.handDX} ${y + face.handDY + ((1 - amount) * SMILEY_HAND_SLIDE)}) rotate(${tiltDeg + face.handTilt}) scale(${SMILEY_HAND_SCALE})`;

    // Draw one hand shape as a single silhouette (shadow, outline, fill, then creases), lit for its angle on the screen
    const hand = (name: string, shape: HandShape, tiltDeg: number): ReactElement => {
        // Its angle on the screen (the face's lean plus its own), the shading down the screen, and the shadow's offset
        const screenDeg = face.tilt + tiltDeg + face.handTilt;
        const shade     = shadeLine(shape.bounds, screenDeg);
        const [sx, sy]  = unturned([SMILEY_HAND_SHADOW_X, SMILEY_HAND_SHADOW_Y], screenDeg);
        const shadeId   = `smiley-hand-${name}-${baseId}`;

        // Each part on its own path, so overlapping parts always fill (whatever way they were drawn)
        const parts = (key: string): ReactElement[] => [shape.behind, shape.body].filter((d: string) => d !== "").map((d: string, i: number) => <path key={`${key}-${i}`} d={d} />);
        return (
            <g strokeLinejoin="round" strokeLinecap="round">
                <defs>
                    <linearGradient id={shadeId} gradientUnits="userSpaceOnUse" x1={shade[0][0]} y1={shade[0][1]} x2={shade[1][0]} y2={shade[1][1]}>
                        <stop offset="0%"   stopColor={paint.hand[0]} />
                        <stop offset="50%"  stopColor={paint.hand[1]} />
                        <stop offset="100%" stopColor={paint.hand[2]} />
                    </linearGradient>
                </defs>
                <g transform={`translate(${sx} ${sy})`} fill={SMILEY_HAND_SHADOW_HEX} opacity={SMILEY_HAND_SHADOW_OPACITY}>
                    {parts("shadow")}
                </g>
                <g fill={paint.skinEdge} stroke={paint.skinEdge} strokeWidth={2 * SMILEY_HAND_EDGE_W}>
                    {parts("edge")}
                </g>
                <g fill={`url(#${shadeId})`}>
                    {parts("fill")}
                </g>
                {(shape.creases !== "") ? <path d={shape.creases} fill="none" stroke={paint.skinEdge} strokeWidth={SMILEY_HAND_CREASE_W} /> : null}
            </g>
        );
    };

    return (
        <g>
            {/* Hand over the mouth (✋) */}
            {(face.handMouth > 0) ? (
                <g transform={placed(face.handMouth, SMILEY_MOUTH_HAND_X, SMILEY_MOUTH_HAND_Y, SMILEY_MOUTH_HAND_TILT_DEG)} opacity={face.handMouth}>
                    {hand("mouth", SMILEY_RAISED_HAND, SMILEY_MOUTH_HAND_TILT_DEG)}
                </g>
            ) : null}

            {/* Hand on the chin (☝️) */}
            {(face.handChin > 0) ? (
                <g transform={placed(face.handChin, SMILEY_CHIN_HAND_X, SMILEY_CHIN_HAND_Y, SMILEY_CHIN_HAND_TILT_DEG)} opacity={face.handChin}>
                    {hand("chin", SMILEY_POINTING_HAND, SMILEY_CHIN_HAND_TILT_DEG)}
                </g>
            ) : null}
        </g>
    );
}


// --------------------------------------------------------------------------------
// Screen Lighting
// --------------------------------------------------------------------------------
// Ends of a gradient line, in the hand's own coordinates, that runs straight down the screen across its outline at that angle
function shadeLine([left, top, right, bottom]: HandShape["bounds"], screenDeg: number): [Point, Point] {
    // 1) Straight down the screen, in the hand's own coordinates
    const down = unturned([0, 1], screenDeg);

    // 2) How far down the screen the outline box's corners reach, plus a margin past each end
    const reach   = ([[left, top], [right, top], [left, bottom], [right, bottom]] as Point[]).map(([x, y]: Point): number => (x * down[0]) + (y * down[1]));
    const margin  = (Math.max(...reach) - Math.min(...reach)) * SMILEY_HAND_SHADE_PAD;
    const highest = Math.min(...reach) - margin;
    const lowest  = Math.max(...reach) + margin;
    return [[down[0] * highest, down[1] * highest], [down[0] * lowest, down[1] * lowest]];
}

// A direction on the screen, in the coordinates of something drawn turned by `screenDeg`
function unturned([x, y]: Point, screenDeg: number): Point {
    const angle = (screenDeg * Math.PI) / 180;
    return [(x * Math.cos(angle)) + (y * Math.sin(angle)), (y * Math.cos(angle)) - (x * Math.sin(angle))];
}
