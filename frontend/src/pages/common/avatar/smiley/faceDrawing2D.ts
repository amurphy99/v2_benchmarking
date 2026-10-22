/* Layout, colors, and SVG shape math for the 2D smiley renderer.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/faceDrawing2D`

Shared by `SmileyFace2D`, `SmileyEye2D`, and `SmileyExtras2D`. Every size is in
SVG units: the face is a radius-100 circle at the origin, and negative y is up.
Feature positions are relative to the feature group, which slides with the head
turn; eye shapes are relative to their eye's center.

The tear, the Zs, the floating hearts, and the spiral spin are animated from
`face.timeSec`, so the renderer stays a pure function of the face it is given.

*/
import type { FaceState } from "./faceState";

// Face layout
export const SMILEY_FACE_R       = 100;   // Face radius
export const SMILEY_TURN_SHIFT_X = 26;    // Feature slide at a full left or right turn
export const SMILEY_TURN_SHIFT_Y = 20;    // Feature slide at a full up or down turn
export const SMILEY_MOUTH_Y      = 36;    // Mouth corner height

// Feature colors and line widths
export const SMILEY_FEATURE_HEX      = "#3b2a1a";   // Eyes, brows, and mouth
export const SMILEY_HEART_HEX        = "#ff3b5c";   // Heart eyes and floating hearts
export const SMILEY_FEATURE_STROKE_W = 5;           // Mouth, closed-eye arcs
export const SMILEY_BROW_STROKE_W    = 6;           // Eyebrows
export const SMILEY_SPIRAL_STROKE_W  = 3.5;         // Spiral eyes

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
const SMILEY_SPIRAL_R                = 15;    // Spiral eye radius
const SMILEY_SPIRAL_TURNS            = 2.5;   // Turns in each spiral
const SMILEY_SPIRAL_SPIN_DEG_PER_SEC = 90;    // Spiral spin speed (the eyes spin opposite ways)
const SMILEY_HEART_EYE_SIZE          = 15;    // Heart eye half-width

// Eyebrows
const SMILEY_BROW_GAP     = 9;    // Gap between the top of the eye and the brow
const SMILEY_BROW_HALF_W  = 14;   // Half the brow's width
const SMILEY_BROW_ARCH    = 4;    // How far the brow's middle bows up
const SMILEY_BROW_RAISE   = 9;    // Brow lift at a full `browRaise` or `browAsym`
const SMILEY_BROW_TILT    = 7;    // Inner-end lift at a full `browAngle` (the outer end drops half as much)

// Mouth
const SMILEY_MOUTH_HALF_W    = 38;   // Half the mouth's width
const SMILEY_MOUTH_CURVE     = 20;   // Drop of the mouth's middle at a full smile
const SMILEY_MOUTH_OPEN_UP   = 8;    // Upper lip lift at a fully open mouth
const SMILEY_MOUTH_OPEN_DOWN = 26;   // Lower lip drop at a fully open mouth
const SMILEY_MOUTH_WAVE      = 5;    // Wave height at a full `mouthWave`
const SMILEY_MOUTH_WAVES     = 3;    // Half-waves across the mouth
const SMILEY_MOUTH_SAMPLES   = 20;   // Points along each lip

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

// Closed-eye arc around the eye center (bows up for smiling eyes, down for sleeping ones)
export function eyeArcPath(face: FaceState): string {
    const halfW = SMILEY_EYE_ARC_HALF_W * face.eyeScale;
    const bow   = SMILEY_EYE_ARC_H * face.eyeArcBend;
    return `M ${-halfW} ${0.4 * bow} Q 0 ${-1.6 * bow} ${halfW} ${0.4 * bow}`;
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

// One eyebrow, above its eye's resting spot (brows follow the head turn but not the gaze)
export function browPath(side: number, face: FaceState): string {
    // Height above the eye, raised together and (for `browAsym`) one side more than the other
    const centerX = side * SMILEY_EYE_X;
    const centerY = SMILEY_EYE_Y - (SMILEY_EYE_RY * face.eyeScale) - SMILEY_BROW_GAP - ((face.browRaise + (face.browAsym * side)) * SMILEY_BROW_RAISE);

    // Inner end (toward the nose) rises for worry and drops for anger
    const tilt   = face.browAngle * SMILEY_BROW_TILT;
    const innerX = centerX - (side * SMILEY_BROW_HALF_W);
    const outerX = centerX + (side * SMILEY_BROW_HALF_W);
    return `M ${innerX} ${centerY - tilt} Q ${centerX} ${centerY - SMILEY_BROW_ARCH - (0.25 * tilt)} ${outerX} ${centerY + (0.5 * tilt)}`;
}


// ================================================================================
// Mouth
// ================================================================================
// Mouth outline around its center: upper lip left to right, then lower lip back (they meet when closed)
export function mouthPath(face: FaceState): string {
    // Depth of each lip's middle below the corners, and its width
    const halfW      = SMILEY_MOUTH_HALF_W * face.mouthWidth;
    const middle     = face.mouthCurve * SMILEY_MOUTH_CURVE;
    const upperDepth = middle - (face.mouthOpen * SMILEY_MOUTH_OPEN_UP);
    const lowerDepth = middle + (face.mouthOpen * SMILEY_MOUTH_OPEN_DOWN);

    // Sample both lips as parabolas between the corners, plus the shared wave
    const lip = (depth: number): string[] => {
        const points: string[] = [];
        for (let i = 0; i <= SMILEY_MOUTH_SAMPLES; i++) {
            const u    = -1 + ((2 * i) / SMILEY_MOUTH_SAMPLES);
            const wave = face.mouthWave * SMILEY_MOUTH_WAVE * Math.sin(Math.PI * SMILEY_MOUTH_WAVES * (u + 1));
            points.push(`${u * halfW} ${(depth * (1 - (u * u))) + wave}`);
        }
        return points;
    };
    return `M ${[...lip(upperDepth), ...lip(lowerDepth).reverse()].join(" L ")} Z`;
}


// ================================================================================
// Extras
// ================================================================================
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

// Fractional part of a number (0 up to 1)
function fraction(value: number): number {
    return value - Math.floor(value);
}
