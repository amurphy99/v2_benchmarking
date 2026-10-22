/* Layout and SVG shape math for the 2D smiley renderer.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/faceDrawing2D`

Shared by `SmileyFace2D` and its parts (`SmileyEye2D`, `SmileyMouth2D`,
`SmileyHand2D`, `SmileyExtras2D`). Every size is in SVG units: the face is a
radius-100 circle at the origin, and negative y is up. Feature positions are
relative to the feature group, which slides with the head turn; eye shapes are
relative to their eye's center, and mouth shapes to the mouth's center.

Brows, closed-eye arcs, and the lip line are tapered like iOS emoji strokes:
filled outlines ("ribbons") that are thickest in the middle and thin at the
ends, rather than lines of one width.

The tear, the Zs, the floating hearts, and the spiral spin are animated from
`face.timeSec`, so the renderer stays a pure function of the face it is given.

*/
import type { FaceState } from "./faceState";

// Face layout
export const SMILEY_FACE_R       = 100;   // Face radius
export const SMILEY_TURN_SHIFT_X = 26;    // Feature slide at a full left or right turn
export const SMILEY_TURN_SHIFT_Y = 20;    // Feature slide at a full up or down turn
export const SMILEY_MOUTH_Y      = 36;    // Mouth corner height

// Colors and line widths the parts share
export const SMILEY_HEART_HEX       = "#ff3b5c";   // Heart eyes and floating hearts
export const SMILEY_SPIRAL_STROKE_W = 3.5;         // Spiral eyes
export const SMILEY_RIBBON_EDGE_W   = 1.2;         // Outline drawn around each ribbon so its ends come out round

// Open eyes
const SMILEY_EYE_X       = 34;     // Eye distance from the center line
const SMILEY_EYE_Y       = -22;    // Eye height
const SMILEY_EYE_RX      = 11;     // Eye half-width
const SMILEY_EYE_RY      = 17;     // Eye half-height
const SMILEY_EYE_MIN_RY  = 1.5;    // Closed eyes stay a thin line
const SMILEY_GAZE_SHIFT  = 16;     // Farthest the eyes move for gaze
const SMILEY_TURN_NARROW = 0.35;   // Narrowing of the eye nearer the edge at a full turn
const SMILEY_LID_MAX_DEG = 28;     // Eyelid slant at a full `lidAngle`
const SMILEY_LID_DEPTH   = 0.55;   // How far a full slant cuts into the eye, as a fraction of its height

// Other eye styles
const SMILEY_EYE_ARC_HALF_W          = 13;    // Half-width of a closed-eye arc
const SMILEY_EYE_ARC_H               = 7;     // How far a closed-eye arc bows up or down
const SMILEY_EYE_ARC_W               = 6.5;   // Closed-eye arc thickness at its middle
const SMILEY_EYE_ARC_END_W           = 2.5;   // ...and at its ends
const SMILEY_SPIRAL_R                = 15;    // Spiral eye radius
const SMILEY_SPIRAL_TURNS            = 2.5;   // Turns in each spiral
const SMILEY_SPIRAL_SPIN_DEG_PER_SEC = 90;    // Spiral spin speed (the eyes spin opposite ways)
const SMILEY_HEART_EYE_SIZE          = 15;    // Heart eye half-width

// Eyebrows
const SMILEY_BROW_GAP    = 9;     // Gap between the top of the eye and the brow
const SMILEY_BROW_HALF_W = 13;    // Half the brow's width
const SMILEY_BROW_ARCH   = 5;     // How far the brow's middle bows up
const SMILEY_BROW_RAISE  = 9;     // Brow lift at a full `browRaise` or `browAsym`
const SMILEY_BROW_TILT   = 7;     // Inner-end lift at a full `browAngle` (the outer end drops half as much)
const SMILEY_BROW_W      = 7;     // Brow thickness at its middle
const SMILEY_BROW_END_W  = 2.5;   // ...and at its ends

// Mouth
const SMILEY_MOUTH_HALF_W          = 38;     // Half the mouth's width
const SMILEY_MOUTH_CURVE           = 20;     // Drop of the mouth's middle at a full smile
const SMILEY_MOUTH_OPEN_UP         = 14;     // Upper lip lift at a fully open mouth (flattens a grin's top edge)
const SMILEY_MOUTH_OPEN_DOWN       = 26;     // Lower lip drop at a fully open mouth
const SMILEY_MOUTH_WAVE            = 5;      // Wave height at a full `mouthWave`
const SMILEY_MOUTH_WAVES           = 3;      // Half-waves across the mouth
const SMILEY_MOUTH_SQUARE_POWER    = 8;      // Extra flatness of the lips at a full `mouthSquare` (2 is a plain curve)
const SMILEY_MOUTH_SAMPLES         = 24;     // Points along each lip
const SMILEY_MOUTH_LINE_W          = 7;      // Lip line thickness at its middle
const SMILEY_MOUTH_LINE_END_W      = 3;      // ...and at its corners
const SMILEY_MOUTH_OPEN_LINE_SHARE = 0.35;   // Share of that thickness kept once the mouth opens (the opening shows the mouth)
const SMILEY_MOUTH_LINE_FADE_OPEN  = 0.25;   // Openness at which the lip line has thinned all the way

// Teeth and tongue, as shares of the open mouth's height at its middle
const SMILEY_TEETH_ROW_SHARE      = 0.5;                            // Height of a full row of teeth
const SMILEY_TOOTH_GAP_SPOTS      = [-0.66, -0.33, 0, 0.33, 0.66];  // Where the lines between teeth sit, across the mouth (-1 to 1)
const SMILEY_TONGUE_WIDTH_SHARE   = 0.45;                           // Tongue half-width, as a share of the mouth's half-width
const SMILEY_TONGUE_HEIGHT_SHARE  = 0.32;                           // Tongue half-height
const SMILEY_TONGUE_RAISE_SHARE   = 0.22;                           // How far the tongue sits above the lower lip

// Icicles along the bottom of the face: [angle in degrees (90 is straight down), base width, length]
const SMILEY_ICICLES: [number, number, number][] = [[58, 10, 13], [71, 12, 22], [83, 11, 16], [96, 13, 25], [109, 11, 15], [122, 10, 19]];
const SMILEY_ICICLE_INSET = 3;   // How far each icicle's base sits inside the face edge

// Tear (one drip runs down the right cheek, then the next starts)
const SMILEY_TEAR_X          = 42;    // Tear's path, just outside the right eye
const SMILEY_TEAR_START_Y    = 4;     // Where it forms, under the eye
const SMILEY_TEAR_FALL       = 52;    // How far it runs down the cheek
const SMILEY_TEAR_SIZE       = 7.5;   // Tear half-width
const SMILEY_TEAR_PERIOD_SEC = 2.4;   // One drip

// Sleep Zs (each one rises up and to the right from beside the head, growing and fading)
const SMILEY_ZZZ_X          = 58;    // Where each Z starts
const SMILEY_ZZZ_Y          = -72;
const SMILEY_ZZZ_DRIFT      = 30;    // How far each Z drifts right and rises
const SMILEY_ZZZ_RISE       = 52;
const SMILEY_ZZZ_MIN_SIZE   = 16;    // Z size at the start and end of its rise
const SMILEY_ZZZ_MAX_SIZE   = 34;
const SMILEY_ZZZ_COUNT      = 3;     // Zs in the air at once
const SMILEY_ZZZ_PERIOD_SEC = 3.0;   // One Z's rise

// Floating hearts (each bobs and pulses at its own spot around the head)
const SMILEY_HEART_SPOTS: [number, number][] = [[-96, -50], [94, -68], [98, 40]];
const SMILEY_HEART_SIZE   = 11;    // Heart half-width
const SMILEY_HEART_BOB    = 4;     // Bob height
const SMILEY_HEART_BOB_HZ = 0.8;   // Bobs per second
const SMILEY_HEART_PULSE  = 0.12;  // Size change at the top of a pulse

// Heart with a half-width of 1, centered on the origin
export const SMILEY_HEART_PATH = "M 0 0.85 C -0.3 0.6 -1 0.1 -1 -0.35 C -1 -0.85 -0.35 -1.05 0 -0.55 C 0.35 -1.05 1 -0.85 1 -0.35 C 1 0.1 0.3 0.6 0 0.85 Z";

// Tear drop with a half-width of 1, its round end at the origin and its point upward
export const SMILEY_TEAR_PATH = "M 0 -2 C 0.45 -1.2 1 -0.6 1 0 A 1 1 0 0 1 -1 0 C -1 -0.6 -0.45 -1.2 0 -2 Z";


// --------------------------------------------------------------------------------
// Drawing Types
// --------------------------------------------------------------------------------
// An x, y point
type Point = [number, number];

// Fills the renderer's gradients provide to its parts (`url(#...)` strings, or a plain color)
export type SmileyPaint = {
    feature  : string;   // Eyes, brows, closed-eye arcs, and the lip line
    mouth    : string;   // Inside an open mouth
    teeth    : string;   // Teeth
    skin     : string;   // Hands, shaded like the face
    skinEdge : string;   // Hand outline (a plain color)
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
    opening     : string;   // Outline of the opening: upper lip left to right, then lower lip back
    line        : string;   // Tapered lip line along the upper lip
    topTeeth    : string;   // Band of teeth under the upper lip
    bottomTeeth : string;   // Band of teeth over the lower lip
    toothGaps   : string;   // Lines between the teeth, top lip to bottom lip
    rowLine     : string;   // Line between the two rows of teeth
    tongue      : {cx: number; cy: number; rx: number; ry: number};
};


// ================================================================================
// Eyes and Brows
// ================================================================================
// Place and size one eye (`side` is -1 for the left eye, 1 for the right)
export function eyeGeometry(side: number, face: FaceState): EyeGeometry {
    // The eye nearer the edge narrows as the head turns toward it, and closes into an arc
    const edgeward = Math.max(0, side * face.turnX);
    const rx       = SMILEY_EYE_RX * face.eyeScale * (1 - (edgeward * SMILEY_TURN_NARROW));
    const ry       = Math.max(SMILEY_EYE_RY * face.eyeScale * face.eyeOpen * (1 - face.eyeArc), SMILEY_EYE_MIN_RY);

    return {
        cx       : (side * SMILEY_EYE_X) + (face.gazeX * SMILEY_GAZE_SHIFT),
        cy       : SMILEY_EYE_Y + (face.gazeY * SMILEY_GAZE_SHIFT),
        rx       : rx,
        ry       : ry,
        lidDeg   : side * face.lidAngle * SMILEY_LID_MAX_DEG,
        lidEdgeY : -ry + (Math.abs(face.lidAngle) * 2 * ry * SMILEY_LID_DEPTH),
    };
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

// Heart eye scale (it swells slightly as it fades in)
export function heartEyeScale(face: FaceState): number {
    return SMILEY_HEART_EYE_SIZE * face.eyeScale * (0.6 + (0.4 * face.heartEyes));
}

// One tapered eyebrow, above its eye's resting spot (brows follow the head turn but not the gaze)
export function browPath(side: number, face: FaceState): string {
    // Height above the eye, raised together and (for `browAsym`) one side more than the other
    const centerX = side * SMILEY_EYE_X;
    const centerY = SMILEY_EYE_Y - (SMILEY_EYE_RY * face.eyeScale) - SMILEY_BROW_GAP - ((face.browRaise + (face.browAsym * side)) * SMILEY_BROW_RAISE);

    // Inner end (toward the nose) rises for worry and drops for anger
    const tilt   = face.browAngle * SMILEY_BROW_TILT;
    const inner  : Point = [centerX - (side * SMILEY_BROW_HALF_W), centerY - tilt];
    const middle : Point = [centerX, centerY - SMILEY_BROW_ARCH - (0.25 * tilt)];
    const outer  : Point = [centerX + (side * SMILEY_BROW_HALF_W), centerY + (0.5 * tilt)];
    const points = quadPoints(inner, middle, outer);
    return ribbonPath(points, taper(points.length, SMILEY_BROW_W, SMILEY_BROW_END_W));
}


// ================================================================================
// Mouth
// ================================================================================
// Opening, lip line, teeth, and tongue for the face's mouth, around the mouth's center
export function mouthShape(face: FaceState): MouthShape {
    // 1) Each lip's depth below the corners at the middle, and how flat its curve is
    const halfW      = SMILEY_MOUTH_HALF_W * face.mouthWidth;
    const middle     = face.mouthCurve * SMILEY_MOUTH_CURVE;
    const upperDepth = middle - (face.mouthOpen * SMILEY_MOUTH_OPEN_UP);
    const lowerDepth = middle + (face.mouthOpen * SMILEY_MOUTH_OPEN_DOWN);
    const power      = 2 + (face.mouthSquare * SMILEY_MOUTH_SQUARE_POWER);

    // 2) Height of a lip across the mouth (`u` runs -1 to 1), with the shared wave
    const lipY = (depth: number, u: number): number => (depth * (1 - Math.pow(Math.abs(u), power))) + (face.mouthWave * SMILEY_MOUTH_WAVE * Math.sin(Math.PI * SMILEY_MOUTH_WAVES * (u + 1)));
    const spots = Array.from({length: SMILEY_MOUTH_SAMPLES + 1}, (_: unknown, i: number): number => -1 + ((2 * i) / SMILEY_MOUTH_SAMPLES));
    const upper = spots.map((u: number): Point => [u * halfW, lipY(upperDepth, u)]);
    const lower = spots.map((u: number): Point => [u * halfW, lipY(lowerDepth, u)]);

    // 3) Lip line: thick when closed, thinning as the mouth opens
    const lineShare = 1 - ((1 - SMILEY_MOUTH_OPEN_LINE_SHARE) * Math.min(1, face.mouthOpen / SMILEY_MOUTH_LINE_FADE_OPEN));
    const lineWidth = spots.map((u: number): number => lineShare * (SMILEY_MOUTH_LINE_END_W + ((SMILEY_MOUTH_LINE_W - SMILEY_MOUTH_LINE_END_W) * Math.cos((Math.PI * u) / 2))));

    // 4) Teeth rows follow their lip, each up to half the opening's height (the opening clips them)
    const gap          = lowerDepth - upperDepth;
    const topHeight    = gap * SMILEY_TEETH_ROW_SHARE * face.teethTop;
    const bottomHeight = gap * SMILEY_TEETH_ROW_SHARE * face.teethBottom;
    const shifted      = (points: Point[], dy: number): Point[] => points.map(([x, y]: Point): Point => [x, y + dy]);
    const rowMiddle    = upper.map(([x, y]: Point, i: number): Point => [x, (y + topHeight + lower[i][1] - bottomHeight) / 2]);

    // 5) Gap lines run from lip to lip at fixed spots across the mouth
    const toothGaps = SMILEY_TOOTH_GAP_SPOTS.map((u: number): string => `M ${u * halfW} ${lipY(upperDepth, u)} L ${u * halfW} ${lipY(lowerDepth, u)}`).join(" ");

    return {
        opening     : closedPath([...upper, ...[...lower].reverse()]),
        line        : ribbonPath(upper, lineWidth),
        topTeeth    : closedPath([...upper, ...shifted(upper, topHeight).reverse()]),
        bottomTeeth : closedPath([...lower, ...shifted(lower, -bottomHeight).reverse()]),
        toothGaps   : toothGaps,
        rowLine     : `M ${rowMiddle.map(([x, y]: Point) => `${x} ${y}`).join(" L ")}`,
        tongue      : {
            cx : 0,
            cy : lowerDepth - (gap * SMILEY_TONGUE_RAISE_SHARE),
            rx : halfW * SMILEY_TONGUE_WIDTH_SHARE,
            ry : gap * SMILEY_TONGUE_HEIGHT_SHARE,
        },
    };
}


// ================================================================================
// Extras
// ================================================================================
// Icicles hanging from the bottom edge of the face, in the face group's coordinates
export const SMILEY_ICICLE_PATHS = SMILEY_ICICLES.map(([degrees, width, length]: [number, number, number]): string => {
    // Base sits just inside the edge, across the edge; the tip points straight out from the center
    const angle = (degrees * Math.PI) / 180;
    const [nx, ny] = [Math.cos(angle), Math.sin(angle)];
    const base: Point = [nx * (SMILEY_FACE_R - SMILEY_ICICLE_INSET), ny * (SMILEY_FACE_R - SMILEY_ICICLE_INSET)];
    const tip : Point = [nx * (SMILEY_FACE_R + length), ny * (SMILEY_FACE_R + length)];
    return closedPath([[base[0] + (ny * width / 2), base[1] - (nx * width / 2)], tip, [base[0] - (ny * width / 2), base[1] + (nx * width / 2)]]);
});

// Where the tear is in its drip: it forms under the eye, runs down the cheek (speeding up a little), and fades
export function tearSprite(face: FaceState): Sprite {
    const phase = fraction(face.timeSec / SMILEY_TEAR_PERIOD_SEC);
    const grow  = Math.min(1, phase / 0.25);
    const fall  = Math.max(0, (phase - 0.25) / 0.75);
    return {
        x       : SMILEY_TEAR_X,
        y       : SMILEY_TEAR_START_Y + (Math.pow(fall, 1.4) * SMILEY_TEAR_FALL),
        size    : SMILEY_TEAR_SIZE * face.tear * (0.4 + (0.6 * grow)),
        opacity : face.tear * ((phase < 0.8) ? 1 : ((1 - phase) / 0.2)),
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

// Hearts bobbing and pulsing at their spots around the head
export function heartSprites(face: FaceState): Sprite[] {
    return SMILEY_HEART_SPOTS.map(([x, y]: [number, number], i: number): Sprite => {
        const beat = 2 * Math.PI * ((face.timeSec * SMILEY_HEART_BOB_HZ) + (i / SMILEY_HEART_SPOTS.length));
        return {
            x       : x,
            y       : y + (SMILEY_HEART_BOB * Math.sin(beat)),
            size    : SMILEY_HEART_SIZE * face.hearts * (1 + (SMILEY_HEART_PULSE * Math.sin(2 * beat))),
            opacity : face.hearts,
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

// Closed SVG path through a list of points
function closedPath(points: Point[]): string {
    return `M ${points.map(([x, y]: Point) => `${x} ${y}`).join(" L ")} Z`;
}

// Fractional part of a number (0 up to 1)
function fraction(value: number): number {
    return value - Math.floor(value);
}
