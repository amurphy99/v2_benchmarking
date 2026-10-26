/* Shapes, placement, and lighting for the smiley's objects (hands, hearts) in the 2D renderer.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/render_2d/objectDrawing2D`

Shared by `SmileyHand2D` and `SmileyHeart2D` (the tear in `SmileyExtras2D` and
the heart eyes in `SmileyEye2D` borrow shapes from the library too):

  - the shape library: each hand shape (its outline, creases, and measured
    outline box, drawn as a left hand) and the heart and tear paths
  - placement: where a placed object (`objects/faceObjects`) draws, with the
    right hand mirrored, a hand rising into place as it fades in, and a heart
    bobbing and pulsing on its own timing
  - lighting: an object is lit from the top of the head, like the face's own
    shading. Its gradient runs straight down the head across the object's
    height at its angle (`shadeLine`), so a tilted hand is still lighter on
    top, and its shadow falls straight down the head too (`unturned`)

Objects are drawn in the feature group, so they slide with the head turn and
lean with the head.

*/
import type { HandObject, HandShapeName, HeartObject } from "../objects/faceObjects";
import type { Point, Sprite                          } from "./faceDrawing2D";

// Hands: their size (times each hand's own `scale`), and how far one rises into place while fading in
const SMILEY_HAND_SCALE = 1.3;
const SMILEY_HAND_SLIDE = 18;

// Floating hearts: half-width at a `scale` of 1, and bobs per second (each heart bobs from its own `phase`)
const SMILEY_HEART_SIZE   = 11;
const SMILEY_HEART_BOB_HZ = 0.8;

// Shading reaches this share of an object's height past its top and bottom (so neither end is the palest or deepest)
const SMILEY_OBJECT_SHADE_PAD = 0.1;

// Small highlight inside the tear and each heart (sizes are in the shape's own unit size)
export const SMILEY_EXTRA_SHINE_HEX     = "#ffffff";
export const SMILEY_EXTRA_SHINE_OPACITY = 0.6;


// --------------------------------------------------------------------------------
// Shape Library
// --------------------------------------------------------------------------------
// One hand shape's paths, in its own coordinates (fingers pointing up, roughly centered on the origin, drawn as a left hand)
export type HandShape = {
    behind  : string;                             // Extra closed part joined to the silhouette, like a thumb ("" for none)
    body    : string;                             // The hand's main closed shape
    creases : string;                             // Lines where fingers meet ("" for none)
    bounds  : [number, number, number, number];   // Outline box (left, top, right, bottom), measured with `getBBox`
};

// Every hand shape
export const SMILEY_HAND_SHAPES: Record<HandShapeName, HandShape> = {
    // Back of a raised hand: fingers together and pointing up, thumb out to the left (✋)
    raised: {
        behind  : "M -19 14 C -27 9 -32 0 -32.5 -8 A 5 5 0 0 1 -23 -11 C -21 -4 -18 1 -14 4 Z",
        body    : "M -21.3 16 L -21.3 -34.2 A 5.8 5.8 0 0 1 -9.7 -34.2 L -10 -38 A 6 6 0 0 1 2 -38 L 1.7 -35.2 A 5.8 5.8 0 0 1 13.3 -35.2 L 12.8 -27.8 A 5.2 5.2 0 0 1 23.2 -27.8 "
                + "L 24 -6 C 26 4 26 16 20 24 C 14 30 -14 30 -19 24 C -22 21 -21.3 20 -21.3 16 Z",
        creases : "M -9.8 -33 L -9.8 -16 M 1.8 -34 L 1.8 -16 M 12.9 -26 L 12.9 -12",
        bounds  : [-32.6, -44, 25.2, 28.5],
    },

    // Back of a hand with the index finger raised, the other fingers curled, and the thumb out to the left (☝️;
    // outline from the Bootstrap Icons "hand-index-thumb" icon, MIT license, scaled up and centered on the fist)
    pointing: {
        behind  : "",
        body    : "M 0 -25.3 L 0 -35.1 A 6.3 6.3 0 1 0 -12.6 -35.1 L -12.6 -11.5 L -18.2 -17.2 A 5.5 5.5 0 0 0 -26.7 -10.5 L -17.8 4.5 L -13.4 13.2 A 5.4 5.4 0 0 0 -8.6 16.2 L 14.1 16.2 A 5.4 5.4 0 0 0 18.8 13.5 L 23.8 4.7 A 12.6 12.6 0 0 0 25.4 -0.3 L 26.4 -10.1 A 7.2 7.2 0 0 0 19.2 -18 L 17.1 -18 A 18.4 18.4 0 0 0 16.4 -18.9 C 15.8 -19.7 14.6 -20.9 13.3 -21.5 C 12 -22 10.2 -21.9 9.1 -21.9 L 8.6 -21.8 "
                + "A 4.5 4.5 0 0 0 6.6 -24.1 A 9.5 9.5 0 0 0 4 -25.2 C 2.8 -25.4 1.3 -25.4 0.2 -25.3 Z",
        creases : "M 0 -24.5 L 0 -17.6 M 7.2 -22.7 L 7.2 -15.8 M 16.2 -17.6 L 16.2 -11.2 M -12.6 -11.5 L -11.2 -7.6",
        bounds  : [-27.3, -41.4, 26.4, 16.2],
    },
};

// Heart with a half-width of 1, centered on the origin (the floating hearts and the heart eyes)
export const SMILEY_HEART_PATH = "M 0 0.85 C -0.3 0.6 -1 0.1 -1 -0.35 C -1 -0.85 -0.35 -1.05 0 -0.55 C 0.35 -1.05 1 -0.85 1 -0.35 C 1 0.1 0.3 0.6 0 0.85 Z";

// Tear drop with a half-width of 1, its round end at the origin and its point upward
export const SMILEY_TEAR_PATH = "M 0 -2 C 0.45 -1.2 1 -0.6 1 0 A 1 1 0 0 1 -1 0 C -1 -0.6 -0.45 -1.2 0 -2 Z";


// ================================================================================
// Placement
// ================================================================================
// Where a hand draws: at its place, turned, and sized (mirrored for the right hand), rising into place as it fades in
export function handTransform(hand: HandObject): string {
    const size = SMILEY_HAND_SCALE * hand.scale;
    return `translate(${hand.x} ${hand.y + ((1 - hand.amount) * SMILEY_HAND_SLIDE)}) rotate(${hand.angle}) scale(${hand.mirrored ? -size : size} ${size})`;
}

// Where a heart draws this frame: bobbing and pulsing on its own timing, and growing in as it fades in
export function heartPose(heart: HeartObject, timeSec: number): Sprite {
    const beat = 2 * Math.PI * ((timeSec * SMILEY_HEART_BOB_HZ) + heart.phase);
    return {
        x       : heart.x,
        y       : heart.y + (heart.bob * Math.sin(beat)),
        size    : SMILEY_HEART_SIZE * heart.scale * heart.amount * (1 + (heart.pulse * Math.sin(2 * beat))),
        opacity : heart.amount,
    };
}


// --------------------------------------------------------------------------------
// Lighting
// --------------------------------------------------------------------------------
// Ends of a gradient line, in an object's own coordinates, that runs straight down the head across its outline box
export function shadeLine([left, top, right, bottom]: HandShape["bounds"], angleDeg: number, mirrored: boolean): [Point, Point] {
    // 1) Straight down the head, in the object's own coordinates
    const down = unturned([0, 1], angleDeg, mirrored);

    // 2) How far down the head the outline box's corners reach, plus a margin past each end
    const reach   = ([[left, top], [right, top], [left, bottom], [right, bottom]] as Point[]).map(([x, y]: Point): number => (x * down[0]) + (y * down[1]));
    const margin  = (Math.max(...reach) - Math.min(...reach)) * SMILEY_OBJECT_SHADE_PAD;
    const highest = Math.min(...reach) - margin;
    const lowest  = Math.max(...reach) + margin;
    return [[down[0] * highest, down[1] * highest], [down[0] * lowest, down[1] * lowest]];
}

// A direction on the head, in the coordinates of an object drawn turned by `angleDeg` (and mirrored, for a right hand)
export function unturned([x, y]: Point, angleDeg: number, mirrored: boolean): Point {
    const angle = (angleDeg * Math.PI) / 180;
    const local = [(x * Math.cos(angle)) + (y * Math.sin(angle)), (y * Math.cos(angle)) - (x * Math.sin(angle))];
    return mirrored ? [-local[0], local[1]] : [local[0], local[1]];
}
