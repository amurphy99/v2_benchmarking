/* Layout and SVG shape math for the 2D smiley renderer.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/render_2d/faceDrawing2D`

Shared by `SmileyFace2D` and its parts (`SmileyEye2D`, `SmileyMouth2D`,
`SmileyExtras2D`); the objects (hands, hearts) have their own shapes and helpers
in `objectDrawing2D`. Every size is in SVG units: the face is a radius-100
circle at the origin, and negative y is up. Feature positions are relative to
the feature group, which slides with the head turn; eye shapes are relative to
their eye's center, and mouth shapes to the mouth's center. The feature
positions here also place the objects' named spots (`objects/faceObjects`).

Brows, closed-eye arcs, and the lip line are tapered like iOS emoji strokes:
filled outlines ("ribbons") that are thickest in the middle and thin at the
ends, rather than lines of one width.

The tear, the Zs, and the spiral spin are animated from the face's clocks
(`timeSec`, `expressionSec`), so the renderer stays a pure function of the face
it is given.

*/
import type { FaceState } from "../state/faceState";

// Face layout
export const SMILEY_FACE_R       = 100;   // Face radius
export const SMILEY_TURN_SHIFT_X = 26;    // Feature slide at a full left or right turn
export const SMILEY_TURN_SHIFT_Y = 20;    // Feature slide at a full up or down turn
export const SMILEY_EYE_X        = 37;    // Eye distance from the center line
export const SMILEY_EYE_Y        = -24;   // Eye height
export const SMILEY_MOUTH_Y      = 38;    // Mouth corner height
export const SMILEY_BLUSH_X      = 60;    // Cheek distance from the center line
export const SMILEY_BLUSH_Y      = 9;     // Cheek height

// Colors and line widths the parts share
export const SMILEY_SPIRAL_STROKE_W = 3.5;         // Spiral eyes
export const SMILEY_RIBBON_EDGE_W   = 1.2;         // Outline drawn around each ribbon so its ends come out round

// Open eyes
const SMILEY_EYE_R       = 16.1;   // Radius of a round open eye (an oval eye keeps the same area)
const SMILEY_EYE_MIN_RY  = 1.5;    // Closed eyes stay a thin line
const SMILEY_GAZE_SHIFT  = 16;     // Farthest the eyes move for gaze
const SMILEY_TURN_NARROW = 0.35;   // Narrowing of the eye nearer the edge at a full turn
const SMILEY_LID_MAX_DEG = 28;     // Eyelid slant at a full `lidAngle`
const SMILEY_LID_DEPTH   = 0.55;   // How far a full slant cuts into the eye, as a fraction of its height

// Other eye styles
const SMILEY_EYE_ARC_HALF_W          = 15;    // Half-width of a closed-eye arc
const SMILEY_EYE_ARC_H               = 8;     // How far a closed-eye arc bows up or down
const SMILEY_EYE_ARC_W               = 7.5;   // Closed-eye arc thickness at its middle
const SMILEY_EYE_ARC_END_W           = 2.8;   // ...and at its ends
const SMILEY_SPIRAL_R                = 17;    // Spiral eye radius
const SMILEY_SPIRAL_TURNS            = 2.5;   // Turns in each spiral
const SMILEY_SPIRAL_SPIN_DEG_PER_SEC = 90;    // Spiral spin speed (the eyes spin opposite ways)
const SMILEY_HEART_EYE_SIZE          = 25;    // Heart eye half-width (big enough to cover an open eye)

// Eyebrows
const SMILEY_BROW_GAP    = 9;     // Gap between the top of the eye and the brow
const SMILEY_BROW_FOLLOW = 0.75;  // Share of the eyes' gaze shift the brows follow (1 keeps them right over the eyes)
const SMILEY_BROW_CLEAR  = 2.5;   // Least gap between a brow's lower edge and its eye (a lowered brow stops there)
const SMILEY_BROW_HALF_W = 15;    // Half the brow's width
const SMILEY_BROW_ARCH   = 6;     // How far the brow's middle bows up
const SMILEY_BROW_RAISE  = 10;    // Brow lift at a full `browRaise` or `browAsym`
const SMILEY_BROW_TILT   = 8;     // Inner-end lift at a full `browAngle` (the outer end drops half as much)
const SMILEY_BROW_W      = 8;     // Brow thickness at its middle
const SMILEY_BROW_END_W  = 3;     // ...and at its ends

// Mouth
export const SMILEY_MOUTH_OUTLINE_W = 3.2;   // Outline around an open mouth
const SMILEY_MOUTH_HALF_W           = 44;    // Half the mouth's width
const SMILEY_MOUTH_CURVE            = 23;    // Drop of the mouth's middle at a full smile
const SMILEY_MOUTH_SLANT            = 6;     // Height difference between the corners at a full `mouthSlant`
const SMILEY_MOUTH_OPEN_UP          = 16;    // Upper lip lift at a fully open mouth (flattens a grin's top edge)
const SMILEY_MOUTH_OPEN_DOWN        = 30;    // Lower lip drop at a fully open mouth
const SMILEY_MOUTH_WAVE             = 6;     // Wave height at a full `mouthWave`
const SMILEY_MOUTH_WAVES            = 3;     // Half-waves across the mouth
const SMILEY_MOUTH_SQUARE_POWER     = 8;     // Extra flatness of the opening at a full `mouthSquare` (2 is a plain curve)
const SMILEY_MOUTH_ROUND_EXPONENT   = 0.5;   // Corner shape at a full `mouthRound` (1 is a pointed corner, 0.5 a round one)
const SMILEY_MOUTH_SAMPLES          = 40;    // Points along each lip (packed toward the corners, where they turn fastest)
const SMILEY_MOUTH_LINE_W           = 8;     // Closed-mouth line thickness at its middle
const SMILEY_MOUTH_LINE_END_W       = 3.4;   // ...and at its corners
const SMILEY_MOUTH_OUTLINE_OPEN     = 0.2;   // Openness by which the opening (fill, teeth, and outline) has fully faded in
const SMILEY_MOUTH_LINE_HIDE_FROM   = 0.12;  // Openness at which the closed-mouth line under it starts fading (the opening covers it by then)
const SMILEY_MOUTH_LINE_HIDE_TO     = 0.25;  // ...and is gone

// Teeth and tongue, as shares of the open mouth's height at its middle
const SMILEY_TEETH_ROW_SHARE      = 0.5;                            // Height of a full row of teeth
const SMILEY_TOOTH_GAP_SPOTS      = [-0.66, -0.33, 0, 0.33, 0.66];  // Where the lines between teeth sit, across the mouth (-1 to 1)
const SMILEY_ROW_LINE_FOLLOW      = 0.3;                            // How much the line between rows follows the teeth's curve (0 is straight)
const SMILEY_TONGUE_WIDTH_SHARE   = 0.45;                           // Tongue half-width, as a share of the mouth's half-width
const SMILEY_TONGUE_HEIGHT_SHARE  = 0.32;                           // Tongue half-height
const SMILEY_TONGUE_RAISE_SHARE   = 0.22;                           // How far the tongue sits above the lower lip

// Icicles hanging straight down from the bottom of the face: [x, base width, length] (uneven on purpose)
const SMILEY_ICICLES: [number, number, number][] = [[-63, 7, 8], [-47, 11, 17], [-30, 8, 10], [-12, 13, 23], [6, 9, 12], [24, 12, 19], [41, 8, 9], [58, 10, 13]];
const SMILEY_ICICLE_INSET = 3;   // How far each icicle's base sits inside the edge it hangs from
const SMILEY_ICICLE_BEND  = 0.15; // How far each side bows in toward the tip, as a share of the base width

// Icicles hanging from the lower lip (frozen drool): [spot across the mouth, -1 to 1, base width, length]
const SMILEY_DROOL_ICICLES: [number, number, number][] = [[-0.32, 7, 10], [0.22, 9, 14]];

// Tear (one drip runs down the right cheek, then the next starts)
const SMILEY_TEAR_X          = 47;    // Tear's path, just outside the right eye
const SMILEY_TEAR_START_Y    = 4;     // Where it forms, under the eye
const SMILEY_TEAR_FALL       = 52;    // How far it runs down the cheek
const SMILEY_TEAR_SIZE       = 7.5;   // Tear half-width
const SMILEY_TEAR_PERIOD_SEC = 3.18;  // One drip: the default 3 s hold plus the 0.18 s ease in, so it ends as the face lets go
const SMILEY_TEAR_LEAD       = 0.12;  // Share of each drip spent hidden at its start

// Sleep Zs (each one rises up and to the right from beside the head, growing and fading)
const SMILEY_ZZZ_X          = 58;    // Where each Z starts
const SMILEY_ZZZ_Y          = -72;
const SMILEY_ZZZ_DRIFT      = 30;    // How far each Z drifts right and rises
const SMILEY_ZZZ_RISE       = 52;
const SMILEY_ZZZ_MIN_SIZE   = 16;    // Z size at the start and end of its rise
const SMILEY_ZZZ_MAX_SIZE   = 34;
const SMILEY_ZZZ_COUNT      = 3;     // Zs in the air at once
const SMILEY_ZZZ_PERIOD_SEC = 3.0;   // One Z's rise


// --------------------------------------------------------------------------------
// Drawing Types
// --------------------------------------------------------------------------------
// An x, y point
export type Point = [number, number];

// Fills the renderer's gradients provide to its parts (`url(#...)` strings, or a plain color)
export type SmileyPaint = {
    feature  : string;   // Eyes, brows, closed-eye arcs, and mouth lines
    mouth    : string;   // Inside an open mouth
    tongue   : string;   // Tongue
    hand     : [string, string, string];   // Hand shading, lit top to shaded bottom (each hand lays it out down the screen)
    skinEdge : string;                     // Hand outline and creases (a plain color)
    heart    : string;   // Floating hearts
    heartEye : string;   // Heart eyes (a deeper red)
    ice      : string;   // Icicles
    tear     : string;   // Tear drop
    zzz      : string;   // Sleep Zs
    blush    : string;   // Cheeks (fades out toward the edges)
};

// A sprite drawn at a point, with its size and opacity
export type Sprite = {x: number; y: number; size: number; opacity: number};

// One open eye's center, size, and eyelid cut
export type EyeGeometry = {
    cx       : number;   // Eye center, in the feature group
    cy       : number;
    rx       : number;   // Eye half-width and half-height
    ry       : number;
    lidDeg   : number;   // Eyelid slant
    lidEdgeY : number;   // Eyelid's lower edge, relative to the eye center
};

// Every shape of the mouth, around its center
export type MouthShape = {
    opening      : string;             // Outline of the opening: upper lip left to right, then lower lip back
    line         : string;             // Tapered closed-mouth line (the smile curve)
    openFade     : number;             // How far the opening (fill, teeth, and outline) has faded in, 0 to 1
    lineFade     : number;             // How visible the closed-mouth line under it still is, 0 to 1
    topTeeth     : string;             // Band of teeth under the upper lip
    bottomTeeth  : string;             // Band of teeth over the lower lip
    topTeethY    : [number, number];   // Heights the upper teeth's shading runs between (its lip, then where the rows meet)
    bottomTeethY : [number, number];   // ...and the lower teeth's (where the rows meet, then its lip)
    toothGaps    : string;             // Lines between the teeth, top lip to bottom lip
    rowLine      : string;             // Line between the two rows of teeth
    drool        : string;             // Icicles hanging from the lower lip
    tongue       : {cx: number; cy: number; rx: number; ry: number};
};


// ================================================================================
// Eyes and Brows
// ================================================================================
// Place and size one eye (`side` is -1 for the left eye, 1 for the right)
export function eyeGeometry(side: number, face: FaceState): EyeGeometry {
    // The eye nearer the edge narrows as the head turns toward it, and closes into an arc
    const edgeward = Math.max(0, side * face.turnX);
    const [openRx, openRy] = openEyeRadii(face);
    const rx       = openRx * (1 - (edgeward * SMILEY_TURN_NARROW));
    const ry       = Math.max(openRy * face.eyeOpen * (1 - face.eyeArc), SMILEY_EYE_MIN_RY);

    return {
        cx       : (side * (SMILEY_EYE_X - face.eyeInset)) + (face.gazeX * SMILEY_GAZE_SHIFT),
        cy       : SMILEY_EYE_Y + (face.gazeY * SMILEY_GAZE_SHIFT),
        rx       : rx,
        ry       : ry,
        lidDeg   : side * face.lidAngle * SMILEY_LID_MAX_DEG,
        lidEdgeY : -ry + (Math.abs(face.lidAngle) * 2 * ry * SMILEY_LID_DEPTH),
    };
}

// Half-width and half-height of a fully open eye: `eyeOval` stretches a circle taller, keeping its area
function openEyeRadii(face: FaceState): [number, number] {
    const radius  = SMILEY_EYE_R * face.eyeScale;
    const stretch = Math.sqrt(1 + face.eyeOval);
    return [radius / stretch, radius * stretch];
}

// Tapered closed-eye arc around the eye center (bows up for smiling eyes, down for sleeping ones)
export function eyeArcPath(face: FaceState): string {
    const halfW  = SMILEY_EYE_ARC_HALF_W * face.eyeScale;
    const bow    = SMILEY_EYE_ARC_H * face.eyeArcBend;
    const points = quadPoints([-halfW, 0.4 * bow], [0, -1.6 * bow], [halfW, 0.4 * bow]);
    return ribbonPath(points, taper(points.length, SMILEY_EYE_ARC_W, SMILEY_EYE_ARC_END_W));
}

// Spiral around the eye center, before its spin
export function spiralPath(face: FaceState): string {
    const radius = SMILEY_SPIRAL_R * face.eyeScale;
    const turns  = SMILEY_SPIRAL_TURNS * 2 * Math.PI;
    const points: string[] = [];
    for (let angle = 0; angle <= turns; angle += 0.3) {
        const r = radius * (angle / turns);
        points.push(`${r * Math.cos(angle)} ${r * Math.sin(angle)}`);
    }
    return `M ${points.join(" L ")}`;
}

// Spin of one spiral eye (the two eyes turn opposite ways)
export function spiralRotationDeg(side: number, face: FaceState): number {
    return side * face.timeSec * SMILEY_SPIRAL_SPIN_DEG_PER_SEC;
}

// Outline around a heart eye, in SVG units at any heart size
export const SMILEY_HEART_EYE_EDGE_W = 0.6;

// Heart eye scale (it swells slightly as it fades in)
export function heartEyeScale(face: FaceState): number {
    return SMILEY_HEART_EYE_SIZE * face.eyeScale * (0.6 + (0.4 * face.heartEyes));
}

// One tapered eyebrow above its eye, following most of the eye's gaze shift and never touching the eye
export function browPath(side: number, face: FaceState): string {
    // 1) Over the eye's resting spot, moved with the gaze, raised together and (for `browAsym`) one side more
    const [openRx, openRy] = openEyeRadii(face);
    const centerX = (side * SMILEY_EYE_X) + (face.gazeX * SMILEY_GAZE_SHIFT * SMILEY_BROW_FOLLOW);
    const centerY = SMILEY_EYE_Y + (face.gazeY * SMILEY_GAZE_SHIFT * SMILEY_BROW_FOLLOW) - openRy - SMILEY_BROW_GAP - ((face.browRaise + (face.browAsym * side)) * SMILEY_BROW_RAISE);

    // 2) Inner end (toward the nose) rises for worry and drops for anger
    const tilt   = face.browAngle * SMILEY_BROW_TILT;
    const inner  : Point = [centerX - (side * SMILEY_BROW_HALF_W), centerY - tilt];
    const middle : Point = [centerX, centerY - SMILEY_BROW_ARCH - (0.25 * tilt)];
    const outer  : Point = [centerX + (side * SMILEY_BROW_HALF_W), centerY + (0.5 * tilt)];
    const points = quadPoints(inner, middle, outer);
    const widths = taper(points.length, SMILEY_BROW_W, SMILEY_BROW_END_W);

    // 3) Lift the whole brow clear of the open eye under it (a blink never moves it)
    const eye  = eyeGeometry(side, face);
    const lift = Math.max(0, ...points.map(([x, y]: Point, i: number): number => {
        const across = (x - eye.cx) / openRx;
        if (Math.abs(across) >= 1) return 0;   // Past the eye's side
        const eyeTop = eye.cy - (openRy * Math.sqrt(1 - (across * across)));
        return (y + (widths[i] / 2) + SMILEY_BROW_CLEAR) - eyeTop;
    }));
    return ribbonPath(points.map(([x, y]: Point): Point => [x, y - lift]), widths);
}


// ================================================================================
// Mouth
// ================================================================================
// Opening, lip lines, teeth, and tongue for the face's mouth, around the mouth's center
export function mouthShape(face: FaceState): MouthShape {
    /*
    Both lips follow the smile curve (a parabola set by `mouthCurve`), and opening the mouth
    pushes them apart by an amount that is largest at the middle and falls to zero at the
    corners. How it falls off sets the mouth's shape: `mouthSquare` keeps the gap wide nearly
    to the corners (a box), and `mouthRound` makes it close with a rounded end instead of a
    point. `mouthFlatTop` straightens the upper lip between the corners (bowed down slightly by
    `mouthTopBow`), so a wide-open grin becomes a half circle, and `mouthCircle` pulls the
    whole opening into a circle as wide as the mouth. A closed mouth is just the smile curve,
    so it stays a clean tapered line.
    */
    // 1) Size, smile curve, and how far each lip moves away from it when open
    const halfW     = SMILEY_MOUTH_HALF_W * face.mouthWidth;
    const curve     = face.mouthCurve * SMILEY_MOUTH_CURVE;
    const lift      = face.mouthOpen * SMILEY_MOUTH_OPEN_UP;
    const drop      = face.mouthOpen * SMILEY_MOUTH_OPEN_DOWN;
    const power     = 2 + (face.mouthSquare * SMILEY_MOUTH_SQUARE_POWER);
    const roundness = 1 - (face.mouthRound * (1 - SMILEY_MOUTH_ROUND_EXPONENT));

    // 2) Smile curve, opening, and wave across the mouth (`u` runs -1 to 1)
    const smile   = (u: number): number => (curve * (1 - (u * u))) + (face.mouthSlant * SMILEY_MOUTH_SLANT * (u / 2));   // Tipped by `mouthSlant`
    const opening = (u: number): number => Math.pow(1 - Math.pow(Math.abs(u), power), roundness);
    const wave    = (u: number): number => face.mouthWave * SMILEY_MOUTH_WAVE * Math.sin(Math.PI * SMILEY_MOUTH_WAVES * (u + 1));
    const flatTop = (u: number): number => face.mouthTopBow * (1 - (u * u));
    const circle  = (u: number): number => halfW * Math.sqrt(1 - (u * u));
    const upperY  = (u: number): number => mix(((1 - face.mouthFlatTop) * (smile(u) - (lift * opening(u)))) + (face.mouthFlatTop * flatTop(u)) + wave(u), -circle(u), face.mouthCircle);
    const lowerY  = (u: number): number => mix(smile(u) + (drop * opening(u)) + wave(u),                                                                circle(u),  face.mouthCircle);

    // 3) Sample points packed toward the corners, where a rounded opening turns fastest
    const spots = Array.from({length: SMILEY_MOUTH_SAMPLES + 1}, (_: unknown, i: number): number => -Math.cos((Math.PI * i) / SMILEY_MOUTH_SAMPLES));
    const upper = spots.map((u: number): Point => [u * halfW, upperY(u)]);
    const lower = spots.map((u: number): Point => [u * halfW, lowerY(u)]);

    // 4) Closed-mouth line along the smile curve, thickest at the middle (it fades only once an opening covers it)
    const closed    = spots.map((u: number): Point => [u * halfW, smile(u) + wave(u)]);
    const lineWidth = spots.map((u: number): number => SMILEY_MOUTH_LINE_END_W + ((SMILEY_MOUTH_LINE_W - SMILEY_MOUTH_LINE_END_W) * Math.cos((Math.PI * u) / 2)));
    const lineHide  = clampUnit((face.mouthOpen - SMILEY_MOUTH_LINE_HIDE_FROM) / (SMILEY_MOUTH_LINE_HIDE_TO - SMILEY_MOUTH_LINE_HIDE_FROM));

    // 5) Teeth rows follow their lip and taper with the opening (the opening clips them)
    const gap          = lowerY(0) - upperY(0);
    const topHeight    = gap * SMILEY_TEETH_ROW_SHARE * face.teethTop;
    const bottomHeight = gap * SMILEY_TEETH_ROW_SHARE * face.teethBottom;
    const topEdgeY     = (u: number): number => upperY(u) + (topHeight    * opening(u));
    const bottomEdgeY  = (u: number): number => lowerY(u) - (bottomHeight * opening(u));

    // 6) Line between the rows: nearly flat, so a curved grin's line meets the lower lip before the corners
    const rowMiddleY = (u: number): number => (topEdgeY(u) + bottomEdgeY(u)) / 2;
    const rowLineY   = (u: number): number => rowMiddleY(0) + ((rowMiddleY(u) - rowMiddleY(0)) * SMILEY_ROW_LINE_FOLLOW);
    const rowPoints  = spots.map((u: number): Point => [u * halfW, rowLineY(u)]);

    // 7) Rows that meet split along that line (kept between the lips), so each row's shading ends at it
    const meet         = Math.min(face.teethTop, face.teethBottom);
    const divideY      = (u: number): number => Math.min(Math.max(rowLineY(u), upperY(u)), lowerY(u));
    const topInnerY    = (u: number): number => mix(topEdgeY(u),    divideY(u), meet);
    const bottomInnerY = (u: number): number => mix(bottomEdgeY(u), divideY(u), meet);
    const topEdge      = spots.map((u: number): Point => [u * halfW, topInnerY(u)]);
    const bottomEdge   = spots.map((u: number): Point => [u * halfW, bottomInnerY(u)]);

    // 8) Gap lines run from lip to lip at fixed spots across the mouth
    const toothGaps = SMILEY_TOOTH_GAP_SPOTS.map((u: number): string => `M ${u * halfW} ${upperY(u)} L ${u * halfW} ${lowerY(u)}`).join(" ");

    // 9) Lip icicles hang straight down from the lower lip, their bases just inside it
    const lipPoint = (x: number): Point => [x, lowerY(x / halfW) - SMILEY_ICICLE_INSET];
    const drool    = SMILEY_DROOL_ICICLES.map(([u, width, length]: [number, number, number]): string => iciclePath(lipPoint((u * halfW) - (width / 2)), lipPoint((u * halfW) + (width / 2)), length + SMILEY_ICICLE_INSET)).join(" ");

    return {
        opening      : closedPath([...upper, ...[...lower].reverse()]),
        line         : ribbonPath(closed, lineWidth),
        openFade     : Math.min(1, face.mouthOpen / SMILEY_MOUTH_OUTLINE_OPEN),
        lineFade     : 1 - (lineHide * lineHide * (3 - (2 * lineHide))),
        topTeeth     : closedPath([...upper, ...[...topEdge].reverse()]),
        bottomTeeth  : closedPath([...lower, ...[...bottomEdge].reverse()]),
        topTeethY    : [Math.min(...upper.map(([, y]: Point) => y)), topInnerY(0)],
        bottomTeethY : [bottomInnerY(0), Math.max(...lower.map(([, y]: Point) => y))],
        toothGaps    : toothGaps,
        rowLine      : `M ${rowPoints.map(([x, y]: Point) => `${x} ${y}`).join(" L ")}`,
        drool        : drool,
        tongue       : {
            cx : 0,
            cy : lowerY(0) - (gap * SMILEY_TONGUE_RAISE_SHARE),
            rx : halfW * SMILEY_TONGUE_WIDTH_SHARE,
            ry : gap * SMILEY_TONGUE_HEIGHT_SHARE,
        },
    };
}


// ================================================================================
// Extras
// ================================================================================
// Icicles hanging from the bottom edge of the face, in the face group's coordinates
export const SMILEY_ICICLE_PATHS = SMILEY_ICICLES.map(([x, width, length]: [number, number, number]): string => {
    // The base follows the face's edge; the tip hangs straight below the middle of the base
    const edgeY = (atX: number): number => Math.sqrt((SMILEY_FACE_R * SMILEY_FACE_R) - (atX * atX)) - SMILEY_ICICLE_INSET;
    return iciclePath([x - (width / 2), edgeY(x - (width / 2))], [x + (width / 2), edgeY(x + (width / 2))], length + SMILEY_ICICLE_INSET);
});

// Where the tear is in its drip, timed from when the emotion began. Each drip starts hidden for a
// moment (so the next one never shows while the face is letting go), fades in under the eye, runs
// down the cheek (speeding up a little), and fades out as the drip ends.
export function tearSprite(face: FaceState): Sprite {
    const phase   = fraction(face.expressionSec / SMILEY_TEAR_PERIOD_SEC);
    const grow    = clampUnit((phase - SMILEY_TEAR_LEAD) / 0.2);
    const fall    = clampUnit((phase - SMILEY_TEAR_LEAD - 0.1) / (0.9 - SMILEY_TEAR_LEAD));
    const fadeIn  = clampUnit((phase - SMILEY_TEAR_LEAD) / 0.1);
    const fadeOut = clampUnit((1 - phase) / 0.2);
    return {
        x       : SMILEY_TEAR_X,
        y       : SMILEY_TEAR_START_Y + (Math.pow(fall, 1.4) * SMILEY_TEAR_FALL),
        size    : SMILEY_TEAR_SIZE * face.tear * (0.4 + (0.6 * grow)),
        opacity : face.tear * fadeIn * fadeOut,
    };
}

// Zs rising beside the head, spaced evenly through their rise
export function zzzSprites(face: FaceState): Sprite[] {
    return Array.from({length: SMILEY_ZZZ_COUNT}, (_: unknown, i: number): Sprite => {
        const phase = fraction((face.timeSec / SMILEY_ZZZ_PERIOD_SEC) + (i / SMILEY_ZZZ_COUNT));
        return {
            x       : SMILEY_ZZZ_X + (phase * SMILEY_ZZZ_DRIFT),
            y       : SMILEY_ZZZ_Y - (phase * SMILEY_ZZZ_RISE),
            size    : SMILEY_ZZZ_MIN_SIZE + (phase * (SMILEY_ZZZ_MAX_SIZE - SMILEY_ZZZ_MIN_SIZE)),
            opacity : face.zzz * Math.sin(Math.PI * phase),
        };
    });
}


// --------------------------------------------------------------------------------
// Path Helpers
// --------------------------------------------------------------------------------
// Points along a quadratic curve from `start` to `end`, bent toward `control`
function quadPoints(start: Point, control: Point, end: Point, count: number = 14): Point[] {
    return Array.from({length: count}, (_: unknown, i: number): Point => {
        const t = i / (count - 1);
        const a = (1 - t) * (1 - t);
        const b = 2 * (1 - t) * t;
        const c = t * t;
        return [(a * start[0]) + (b * control[0]) + (c * end[0]), (a * start[1]) + (b * control[1]) + (c * end[1])];
    });
}

// Thickness at each of `count` points, `middle` at the center easing to `end` at both ends
function taper(count: number, middle: number, end: number): number[] {
    return Array.from({length: count}, (_: unknown, i: number): number => end + ((middle - end) * Math.sin((Math.PI * i) / (count - 1))));
}

// Filled outline of a line through `points`, `widths[i]` thick at each point
function ribbonPath(points: Point[], widths: number[]): string {
    const left : Point[] = [];
    const right: Point[] = [];
    points.forEach(([x, y]: Point, i: number) => {
        // Offset each point both ways along the line's normal (direction from its neighbors)
        const [ax, ay] = points[Math.max(0, i - 1)];
        const [bx, by] = points[Math.min(points.length - 1, i + 1)];
        const length   = Math.hypot(bx - ax, by - ay);
        const [nx, ny] = [-(by - ay) / length, (bx - ax) / length];
        left.push ([x + ((nx * widths[i]) / 2), y + ((ny * widths[i]) / 2)]);
        right.push([x - ((nx * widths[i]) / 2), y - ((ny * widths[i]) / 2)]);
    });
    return closedPath([...left, ...right.reverse()]);
}

// Icicle hanging straight down from a base between two points, its sides bowing in slightly toward the tip
function iciclePath(left: Point, right: Point, length: number): string {
    const bend = SMILEY_ICICLE_BEND * (right[0] - left[0]);
    const midX = (left[0] + right[0]) / 2;
    const tipY = ((left[1] + right[1]) / 2) + length;
    const half = (left[1] + tipY) / 2;
    return `M ${left[0]} ${left[1]} Q ${left[0] + bend} ${half} ${midX} ${tipY} Q ${right[0] - bend} ${half} ${right[0]} ${right[1]} Z`;
}

// Closed SVG path through a list of points
function closedPath(points: Point[]): string {
    return `M ${points.map(([x, y]: Point) => `${x} ${y}`).join(" L ")} Z`;
}

// Move `t` of the way from one number to another
function mix(from: number, to: number, t: number): number {
    return from + ((to - from) * t);
}

// Keep a value between 0 and 1
function clampUnit(value: number): number {
    return Math.max(0, Math.min(1, value));
}

// Fractional part of a number (0 up to 1)
function fraction(value: number): number {
    return value - Math.floor(value);
}
