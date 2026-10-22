/* Draw the smiley's hand poses: a hand held over the mouth, and a hand on the chin.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/SmileyHand2D`

Each pose is a few overlapping rounded shapes (palm, fingers held together,
thumb) drawn so they read as one hand:

  1) a soft shadow of the whole hand, offset onto the face
  2) every shape filled and stroked in the edge color, which becomes the
     outline around the hand's outer silhouette
  3) every shape filled again with the hand gradient and no stroke, covering
     the outlines where the shapes overlap
  4) short crease lines where the fingers meet, and the curl of a fist

The hand gradient is laid out in the hand's own coordinates (see `SmileyFace2D`),
so the shading runs across the whole hand instead of restarting on each shape.

A pose fades in by its amount in the face state and rises into place as it does.
`handDX`, `handDY`, and `handTilt` nudge whichever pose is showing, so one pose
serves several expressions (the over-the-mouth hand is used by 🤭, 🫢, and 🥱).

*/
import type { ReactElement } from "react";

// From this project
import type { SmileyPaint    } from "./faceDrawing2D";
import      { SMILEY_MOUTH_Y } from "./faceDrawing2D";
import type { FaceState      } from "./faceState";

// A rounded shape: [x, y, width, height, rotation in degrees about its bottom middle] (corners round to half its narrower side)
type HandPart = [number, number, number, number, number];

// Hand over the mouth: back of the hand, fingers together and pointing up (local origin at the knuckles)
const SMILEY_MOUTH_HAND: HandPart[] = [
    [-24,   -4, 12,   26, -30],   // Thumb, along the side of the palm
    [-17,  -38, 11.5, 44,   0],   // Index finger
    [-5.5, -42, 11.5, 48,   0],   // Middle finger
    [6,    -39, 11.5, 45,   0],   // Ring finger
    [17.5, -31, 10,   37,   0],   // Little finger
    [-18,   -8, 46,   34,   0],   // Palm
];
const SMILEY_MOUTH_HAND_CREASES  = "M -5.5 -28 L -5.5 -6 M 6 -29 L 6 -6 M 17.5 -22 L 17.5 -6";   // Where the fingers meet
const SMILEY_MOUTH_HAND_TILT_DEG = -30;   // Fingers lean up and to the left

// Hand on the chin: a loose fist with the index finger raised and the thumb under the chin (local origin at the fist)
const SMILEY_CHIN_HAND: HandPart[] = [
    [-16,  -10, 34,   30,   0],   // Fist
    [2,    -19, 26,   11, -10],   // Thumb, along the underside of the chin
    [-15,  -52, 11.5, 46, -22],   // Index finger, raised toward the cheek
];
const SMILEY_CHIN_HAND_CREASES = "M -4 2 Q 6 0 16 3 M -4 11 Q 6 9 15 12";   // Curled fingers on the front of the fist
const SMILEY_CHIN_HAND_X       = -26;   // Fist position, at the left side of the chin
const SMILEY_CHIN_HAND_Y       = 72;

// Size of every pose, how far a pose rises into place while fading in, and its line widths
const SMILEY_HAND_SCALE     = 1.3;
const SMILEY_HAND_SLIDE     = 18;
const SMILEY_HAND_EDGE_W    = 1.6;   // Outline around the hand
const SMILEY_HAND_CREASE_W  = 1.5;   // Finger creases

// Soft shadow of the hand on the face
const SMILEY_HAND_SHADOW_X       = 1.5;
const SMILEY_HAND_SHADOW_Y       = 3.5;
const SMILEY_HAND_SHADOW_HEX     = "#000000";
const SMILEY_HAND_SHADOW_OPACITY = 0.12;


// ================================================================================
// Smiley Hand (2D)
// ================================================================================
// Both hand poses, in the feature group's coordinates (each one is hidden at zero)
export default function SmileyHand2D({face, paint}: {
    face  : FaceState;     // Combined face for this frame
    paint : SmileyPaint;   // Gradient fills from `SmileyFace2D`
}): ReactElement {
    // Place a pose at its spot plus the face's nudges, rising into place as it fades in
    const placed = (amount: number, x: number, y: number, tiltDeg: number): string =>
        `translate(${x + face.handDX} ${y + face.handDY + ((1 - amount) * SMILEY_HAND_SLIDE)}) rotate(${tiltDeg + face.handTilt}) scale(${SMILEY_HAND_SCALE})`;

    // Draw one pose's parts as a single shaded hand with its creases
    const hand = (parts: HandPart[], creases: string): ReactElement => (
        <>
            <g transform={`translate(${SMILEY_HAND_SHADOW_X} ${SMILEY_HAND_SHADOW_Y})`} fill={SMILEY_HAND_SHADOW_HEX} opacity={SMILEY_HAND_SHADOW_OPACITY}>
                {parts.map((part: HandPart, i: number) => handPart(part, `shadow-${i}`))}
            </g>
            <g fill={paint.skinEdge} stroke={paint.skinEdge} strokeWidth={2 * SMILEY_HAND_EDGE_W} strokeLinejoin="round">
                {parts.map((part: HandPart, i: number) => handPart(part, `edge-${i}`))}
            </g>
            <g fill={paint.hand}>
                {parts.map((part: HandPart, i: number) => handPart(part, `fill-${i}`))}
            </g>
            <path d={creases} fill="none" stroke={paint.skinEdge} strokeWidth={SMILEY_HAND_CREASE_W} strokeLinecap="round" />
        </>
    );

    return (
        <g>
            {/* Hand over the mouth */}
            {(face.handMouth > 0) ? (
                <g transform={placed(face.handMouth, 0, SMILEY_MOUTH_Y, SMILEY_MOUTH_HAND_TILT_DEG)} opacity={face.handMouth}>
                    {hand(SMILEY_MOUTH_HAND, SMILEY_MOUTH_HAND_CREASES)}
                </g>
            ) : null}

            {/* Hand on the chin */}
            {(face.handChin > 0) ? (
                <g transform={placed(face.handChin, SMILEY_CHIN_HAND_X, SMILEY_CHIN_HAND_Y, 0)} opacity={face.handChin}>
                    {hand(SMILEY_CHIN_HAND, SMILEY_CHIN_HAND_CREASES)}
                </g>
            ) : null}
        </g>
    );
}


// --------------------------------------------------------------------------------
// Hand Parts
// --------------------------------------------------------------------------------
// One rounded part of a hand (fill and stroke come from its group)
function handPart([x, y, width, height, rotateDeg]: HandPart, key: string): ReactElement {
    return (
        <rect
            key       = {key}
            x         = {x}
            y         = {y}
            width     = {width}
            height    = {height}
            rx        = {Math.min(width, height) / 2}
            transform = {`rotate(${rotateDeg} ${x + (width / 2)} ${y + height})`}
        />
    );
}
