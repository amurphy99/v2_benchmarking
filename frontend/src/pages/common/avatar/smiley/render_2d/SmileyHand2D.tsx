/* Draw one of the smiley's hands: an emoji-style hand at its place, lit from the top of the head.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/render_2d/SmileyHand2D`

A hand is a placed object (`objects/faceObjects`) drawn with one of the shapes
in `objectDrawing2D`: the back of a raised hand (✋) or of a hand with the index
finger raised (☝️). Each shape is drawn as a left hand; the right hand is its
mirror image. The hand fades in by its amount and rises into place as it does.

Drawing order: a soft shadow on the face, then every part (the raised hand's
thumb and the hand itself) stroked at twice the outline width, then every part
filled again with no stroke. The second fill covers the inner half of each
outline, so the parts join into one silhouette with no line where the thumb
meets the palm. Crease lines where fingers meet go on top.

The shading runs straight down the head across the hand at its angle, so a
tilted hand is still lighter on top, and its shadow falls straight down the head
too (both from `objectDrawing2D`).

*/
import type { ReactElement } from "react";
import      { useId        } from "react";

// From this project
import type { HandObject                                             } from "../objects/faceObjects";
import type { SmileyPaint                                            } from "./faceDrawing2D";
import      { handTransform, shadeLine, SMILEY_HAND_SHAPES, unturned } from "./objectDrawing2D";

// Line widths
const SMILEY_HAND_EDGE_W   = 1.6;   // Outline around the hand
const SMILEY_HAND_CREASE_W = 1.5;   // Finger creases

// Soft shadow of the hand on the face, offset down the head (and a little right)
const SMILEY_HAND_SHADOW_X       = 1.5;
const SMILEY_HAND_SHADOW_Y       = 3.5;
const SMILEY_HAND_SHADOW_HEX     = "#000000";
const SMILEY_HAND_SHADOW_OPACITY = 0.12;


// ================================================================================
// Smiley Hand (2D)
// ================================================================================
// One hand as a single silhouette (shadow, outline, fill, then creases), in the feature group's coordinates
export default function SmileyHand2D({hand, paint}: {
    hand  : HandObject;    // Its place, shape, side, and how much of it shows
    paint : SmileyPaint;   // Fills and hand shading colors from `SmileyFace2D`
}): ReactElement {
    // Gradient id, unique per hand on the page (React's ids may hold characters `url(#...)` rejects)
    const shadeId = `smiley-hand-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

    // Its shape, its shading down the head, and its shadow's offset, all at the hand's own angle
    const shape    = SMILEY_HAND_SHAPES[hand.shape];
    const shade    = shadeLine(shape.bounds, hand.angle, hand.mirrored);
    const [sx, sy] = unturned([SMILEY_HAND_SHADOW_X, SMILEY_HAND_SHADOW_Y], hand.angle, hand.mirrored);

    // Each part on its own path, so overlapping parts always fill (whatever way they were drawn)
    const parts = (key: string): ReactElement[] => [shape.behind, shape.body].filter((d: string) => d !== "").map((d: string, i: number) => <path key={`${key}-${i}`} d={d} />);
    return (
        <g transform={handTransform(hand)} opacity={hand.amount} strokeLinejoin="round" strokeLinecap="round">
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
}
