/* Draw the smiley's hand poses: a hand held over the mouth, and a hand on the chin.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/SmileyHand2D`

Each pose is built from rounded rectangles (palm, fingers, thumb) shaded with
the same gradient as the face and outlined in a darker edge color, so the hand
reads against a face of the same color. A pose fades in by its amount in the
face state and rises into place as it does. `handDX`, `handDY`, and `handTilt`
nudge whichever pose is showing, so one pose can serve several expressions
(the over-the-mouth hand is used by 🤭, 🫢, and 🥱).

*/
import type { ReactElement } from "react";

// From this project
import type { SmileyPaint    } from "./faceDrawing2D";
import      { SMILEY_MOUTH_Y } from "./faceDrawing2D";
import type { FaceState      } from "./faceState";

// A rounded rectangle: [x, y, width, height], with its corners rounded to half its narrower side
type HandPart = [number, number, number, number];

// Hand over the mouth (fingers up, back of the hand toward the viewer), centered on the mouth
const SMILEY_MOUTH_HAND_FINGERS: HandPart[] = [[-20, -34, 10, 38], [-9.5, -38, 10.5, 42], [1.5, -36, 10.5, 40], [12.5, -29, 9.5, 33]];
const SMILEY_MOUTH_HAND_PALM   : HandPart   = [-21.5, -10, 44, 36];
const SMILEY_MOUTH_HAND_TILT_DEG = -25;   // Fingers lean up and to the left

// Hand on the chin (fist below the chin, thumb under it, index finger raised along the cheek)
const SMILEY_CHIN_HAND_X         = -24;   // Fist position, at the left side of the chin
const SMILEY_CHIN_HAND_Y         = 70;
const SMILEY_CHIN_HAND_FIST      : HandPart   = [-18, -8, 38, 30];
const SMILEY_CHIN_HAND_KNUCKLES  : HandPart[] = [[0, -6, 22, 10], [0, 3.5, 22, 10], [0, 13, 22, 10]];
const SMILEY_CHIN_HAND_THUMB     : HandPart   = [4, -17, 26, 10];
const SMILEY_CHIN_HAND_INDEX     : HandPart   = [-17, -46, 11, 44];
const SMILEY_CHIN_HAND_THUMB_DEG = -12;   // Thumb tilt (it points along the underside of the chin)
const SMILEY_CHIN_HAND_INDEX_DEG = -18;   // Index finger lean (it points up along the cheek)

// Size of every pose, how far a pose rises into place while fading in, and its outline width
const SMILEY_HAND_SCALE  = 1.3;
const SMILEY_HAND_SLIDE  = 18;
const SMILEY_HAND_EDGE_W = 1.6;


// --------------------------------------------------------------------------------
// Smiley Hand (2D)
// --------------------------------------------------------------------------------
// Both hand poses, in the feature group's coordinates (each one is hidden at zero)
export default function SmileyHand2D({face, paint}: {
    face  : FaceState;     // Combined face for this frame
    paint : SmileyPaint;   // Gradient fills from `SmileyFace2D`
}): ReactElement {
    // Draw one rounded part of a hand
    const part = ([x, y, width, height]: HandPart, key: string, rotateDeg: number = 0): ReactElement => (
        <rect
            key         = {key}
            x           = {x}
            y           = {y}
            width       = {width}
            height      = {height}
            rx          = {Math.min(width, height) / 2}
            transform   = {`rotate(${rotateDeg} ${x + (width / 2)} ${y + height})`}
            fill        = {paint.skin}
            stroke      = {paint.skinEdge}
            strokeWidth = {SMILEY_HAND_EDGE_W}
        />
    );

    // Place a pose at its spot plus the face's nudges, rising into place as it fades in
    const placed = (amount: number, x: number, y: number, tiltDeg: number): string =>
        `translate(${x + face.handDX} ${y + face.handDY + ((1 - amount) * SMILEY_HAND_SLIDE)}) rotate(${tiltDeg + face.handTilt}) scale(${SMILEY_HAND_SCALE})`;

    return (
        <g>
            {/* Hand over the mouth: fingers first, then the palm over their bases */}
            {(face.handMouth > 0) ? (
                <g transform={placed(face.handMouth, 0, SMILEY_MOUTH_Y, SMILEY_MOUTH_HAND_TILT_DEG)} opacity={face.handMouth}>
                    {SMILEY_MOUTH_HAND_FINGERS.map((finger: HandPart, i: number) => part(finger, `finger-${i}`))}
                    {part(SMILEY_MOUTH_HAND_PALM, "palm")}
                </g>
            ) : null}

            {/* Hand on the chin: fist, curled fingers, thumb, then the raised index finger */}
            {(face.handChin > 0) ? (
                <g transform={placed(face.handChin, SMILEY_CHIN_HAND_X, SMILEY_CHIN_HAND_Y, 0)} opacity={face.handChin}>
                    {part(SMILEY_CHIN_HAND_FIST, "fist")}
                    {SMILEY_CHIN_HAND_KNUCKLES.map((knuckle: HandPart, i: number) => part(knuckle, `knuckle-${i}`))}
                    {part(SMILEY_CHIN_HAND_THUMB, "thumb", SMILEY_CHIN_HAND_THUMB_DEG)}
                    {part(SMILEY_CHIN_HAND_INDEX, "index", SMILEY_CHIN_HAND_INDEX_DEG)}
                </g>
            ) : null}
        </g>
    );
}
