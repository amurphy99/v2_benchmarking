/* Draw one frame of the smiley face as SVG.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/SmileyFace2D`

A pure renderer: it draws whatever `FaceState` it is given and holds no timers
or behavior, so a 3D renderer can replace it without touching the controller.

The face is flat, so head turns are faked: the eyes, mouth, and cheeks slide
toward the turn and the eye nearer the edge narrows. Eyelids are face-colored
shapes laid over the top of each eye and slanted by `lidAngle`, standing in
for eyebrows.

A soft shadow sits on the ground under the face. It follows the face sideways
and with its size, and shrinks and fades as the face lifts off the ground.

*/
import type { ReactElement } from "react";
import      { useId        } from "react";

// From this project
import type { FaceState, RGB } from "./faceState";

// Drawing sizes in SVG units (the face is a radius-100 circle at the origin; negative y is up)
const SMILEY_FACE_R          = 100;   // Face radius
const SMILEY_VIEW_TOP        = 45;    // Room above the face for bounces
const SMILEY_VIEW_SIDE       = 28;    // Room beside the face for sways and breathing
const SMILEY_VIEW_BOTTOM     = 30;    // Room below the face for its shadow
const SMILEY_STROKE_W        = 5;     // Outline and mouth line width
const SMILEY_EYE_X           = 34;    // Eye distance from the center line
const SMILEY_EYE_Y           = -22;   // Eye height
const SMILEY_EYE_RX          = 11;    // Eye half-width
const SMILEY_EYE_RY          = 17;    // Eye half-height
const SMILEY_EYE_MIN_RY      = 1.5;   // Closed eyes stay a thin line
const SMILEY_GAZE_SHIFT      = 16;    // Farthest the eyes move for gaze
const SMILEY_MOUTH_Y         = 36;    // Mouth corner height
const SMILEY_MOUTH_HALF_W    = 38;    // Half the mouth's width
const SMILEY_MOUTH_CURVE     = 20;    // Drop of the mouth's middle at a full smile
const SMILEY_MOUTH_OPEN_UP   = 8;     // Upper lip lift at a fully open mouth
const SMILEY_MOUTH_OPEN_DOWN = 26;    // Lower lip drop at a fully open mouth
const SMILEY_BLUSH_X         = 56;    // Cheek distance from the center line
const SMILEY_BLUSH_Y         = 14;    // Cheek height
const SMILEY_BLUSH_RX        = 17;    // Cheek half-width
const SMILEY_BLUSH_RY        = 10;    // Cheek half-height
const SMILEY_TURN_SHIFT_X    = 26;    // Feature slide at a full left or right turn
const SMILEY_TURN_SHIFT_Y    = 20;    // Feature slide at a full up or down turn
const SMILEY_TURN_NARROW     = 0.35;  // Narrowing of the eye nearer the edge at a full turn
const SMILEY_LID_MAX_DEG     = 28;    // Eyelid slant at a full `lidAngle`
const SMILEY_LID_DEPTH       = 0.55;  // How far a full slant covers the eye, as a fraction of its height
const SMILEY_LID_WIDTH       = 3.2;   // Eyelid width, in eye half-widths
const SMILEY_LID_OVERHANG    = 0.6;   // Eyelid height past the eye's top, in eye half-widths (covers the slant)
const SMILEY_SHINE_X         = -38;   // Highlight center
const SMILEY_SHINE_Y         = -52;
const SMILEY_SHINE_RX        = 22;    // Highlight half-width and half-height
const SMILEY_SHINE_RY        = 12;
const SMILEY_SHINE_DEG       = -30;   // Highlight slant

// Ground shadow (sizes in SVG units; lift is how far the face is above its resting height, in face radii)
const SMILEY_SHADOW_Y           = 116;   // Shadow center, just below the resting face
const SMILEY_SHADOW_RX          = 72;    // Shadow half-width and half-height with the face resting on the ground
const SMILEY_SHADOW_RY          = 10;
const SMILEY_SHADOW_LIFT_SHRINK = 1.2;   // Shadow size lost per face radius of lift
const SMILEY_SHADOW_LIFT_FADE   = 1.5;   // Shadow opacity lost per face radius of lift

// Colors and opacities
const SMILEY_FEATURE_HEX       = "#3b2a1a";   // Eyes and mouth
const SMILEY_BLUSH_HEX         = "#ff6f8e";   // Cheeks
const SMILEY_SHINE_HEX         = "#ffffff";   // Highlight on the upper left
const SMILEY_OUTLINE_SHADE     = 0.78;        // Outline is the face color darkened by this factor
const SMILEY_BLUSH_MAX_OPACITY = 0.7;         // Cheek opacity at full blush
const SMILEY_SHINE_OPACITY     = 0.28;        // Highlight opacity
const SMILEY_SHADOW_HEX        = "#000000";   // Ground shadow
const SMILEY_SHADOW_OPACITY    = 0.28;        // Shadow opacity at its center (it fades to clear at the edge)

// One eye's position, size, and eyelid, relative to the feature group
type EyeGeometry = {
    cx       : number;   // Eye center
    cy       : number;
    rx       : number;   // Eye half-width and half-height
    ry       : number;
    lidDeg   : number;   // Eyelid slant (0 draws no lid)
    lidEdgeY : number;   // Eyelid's lower edge, relative to the eye center
    lidH     : number;   // Eyelid height above that edge
};


// ================================================================================
// Smiley Face (2D)
// ================================================================================
// Render one face state as an SVG smiley that fills its box
export default function SmileyFace2D({face}: {
    face : FaceState;   // Combined face for this frame (from `useFaceController`)
}): ReactElement {
    // Face colors and the viewport around it
    const fill    = rgbString(face.faceRgb, 1);
    const outline = rgbString(face.faceRgb, SMILEY_OUTLINE_SHADE);
    const viewBox = `${-(SMILEY_FACE_R + SMILEY_VIEW_SIDE)} ${-(SMILEY_FACE_R + SMILEY_VIEW_TOP)} ${2 * (SMILEY_FACE_R + SMILEY_VIEW_SIDE)} ${(2 * SMILEY_FACE_R) + SMILEY_VIEW_TOP + SMILEY_VIEW_BOTTOM}`;

    // Shadow gradient id, unique per avatar on the page (React's ids may hold characters `url(#...)` rejects)
    const shadowId = `smiley-shadow-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

    // Shadow follows the face's size, and shrinks and fades as the face lifts off the ground
    const lift          = Math.max(0, -face.offsetY);
    const shadowSpread  = face.scale * Math.max(0, 1 - (lift * SMILEY_SHADOW_LIFT_SHRINK));
    const shadowOpacity = Math.max(0, 1 - (lift * SMILEY_SHADOW_LIFT_FADE));

    // Features slide toward the head turn
    const shiftX = face.turnX * SMILEY_TURN_SHIFT_X;
    const shiftY = face.turnY * SMILEY_TURN_SHIFT_Y;

    // Mouth as an upper and a lower curve between the corners (they meet when closed)
    const halfW     = SMILEY_MOUTH_HALF_W * face.mouthWidth;
    const middle    = 2 * face.mouthCurve * SMILEY_MOUTH_CURVE;   // Quadratic control points sit at twice the curve's depth
    const upper     = middle - (2 * face.mouthOpen * SMILEY_MOUTH_OPEN_UP);
    const lower     = middle + (2 * face.mouthOpen * SMILEY_MOUTH_OPEN_DOWN);
    const mouthPath = `M ${-halfW} 0 Q 0 ${upper} ${halfW} 0 Q 0 ${lower} ${-halfW} 0 Z`;

    return (
        <svg className="h-full w-full" viewBox={viewBox} role="img" aria-label="Smiley avatar">
            {/* Ground shadow (stays on the ground, so it never tilts or lifts with the face) */}
            <defs>
                <radialGradient id={shadowId}>
                    <stop offset="0%"   stopColor={SMILEY_SHADOW_HEX} stopOpacity={SMILEY_SHADOW_OPACITY} />
                    <stop offset="100%" stopColor={SMILEY_SHADOW_HEX} stopOpacity={0}                     />
                </radialGradient>
            </defs>
            <ellipse
                cx      = {face.offsetX * SMILEY_FACE_R}
                cy      = {SMILEY_SHADOW_Y}
                rx      = {SMILEY_SHADOW_RX * shadowSpread}
                ry      = {SMILEY_SHADOW_RY * shadowSpread}
                fill    = {`url(#${shadowId})`}
                opacity = {shadowOpacity}
            />

            <g transform={`translate(${face.offsetX * SMILEY_FACE_R} ${face.offsetY * SMILEY_FACE_R}) rotate(${face.tilt}) scale(${face.scale})`}>
                {/* Face */}
                <circle r={SMILEY_FACE_R} fill={fill} stroke={outline} strokeWidth={SMILEY_STROKE_W} />

                <g transform={`translate(${shiftX} ${shiftY})`}>
                    {/* Cheeks */}
                    <ellipse cx={-SMILEY_BLUSH_X} cy={SMILEY_BLUSH_Y} rx={SMILEY_BLUSH_RX} ry={SMILEY_BLUSH_RY} fill={SMILEY_BLUSH_HEX} opacity={face.blush * SMILEY_BLUSH_MAX_OPACITY} />
                    <ellipse cx={ SMILEY_BLUSH_X} cy={SMILEY_BLUSH_Y} rx={SMILEY_BLUSH_RX} ry={SMILEY_BLUSH_RY} fill={SMILEY_BLUSH_HEX} opacity={face.blush * SMILEY_BLUSH_MAX_OPACITY} />

                    {/* Eyes, each with its eyelid */}
                    {[-1, 1].map((side: number) => {
                        const eye = eyeGeometry(side, face);
                        return (
                            <g key={side} transform={`translate(${eye.cx} ${eye.cy})`}>
                                <ellipse rx={eye.rx} ry={eye.ry} fill={SMILEY_FEATURE_HEX} />
                                {(eye.lidDeg !== 0) ? (
                                    <rect
                                        x         = {-0.5 * SMILEY_LID_WIDTH * eye.rx}
                                        y         = {eye.lidEdgeY - eye.lidH}
                                        width     = {SMILEY_LID_WIDTH * eye.rx}
                                        height    = {eye.lidH}
                                        transform = {`rotate(${eye.lidDeg} 0 ${eye.lidEdgeY})`}
                                        fill      = {fill}
                                    />
                                ) : null}
                            </g>
                        );
                    })}

                    {/* Mouth */}
                    <path
                        d              = {mouthPath}
                        transform      = {`translate(0 ${SMILEY_MOUTH_Y})`}
                        fill           = {SMILEY_FEATURE_HEX}
                        stroke         = {SMILEY_FEATURE_HEX}
                        strokeWidth    = {SMILEY_STROKE_W}
                        strokeLinecap  = "round"
                        strokeLinejoin = "round"
                    />
                </g>

                {/* Highlight (drawn last so face-colored eyelids never cut into it) */}
                <ellipse
                    cx        = {SMILEY_SHINE_X}
                    cy        = {SMILEY_SHINE_Y}
                    rx        = {SMILEY_SHINE_RX}
                    ry        = {SMILEY_SHINE_RY}
                    transform = {`rotate(${SMILEY_SHINE_DEG} ${SMILEY_SHINE_X} ${SMILEY_SHINE_Y})`}
                    fill      = {SMILEY_SHINE_HEX}
                    opacity   = {SMILEY_SHINE_OPACITY}
                />
            </g>
        </svg>
    );
}


// --------------------------------------------------------------------------------
// Drawing Helpers
// --------------------------------------------------------------------------------
// Place and size one eye (`side` is -1 for the left eye, 1 for the right)
function eyeGeometry(side: number, face: FaceState): EyeGeometry {
    // The eye nearer the edge narrows as the head turns toward it
    const edgeward = Math.max(0, side * face.turnX);
    const rx       = SMILEY_EYE_RX * face.eyeScale * (1 - (edgeward * SMILEY_TURN_NARROW));
    const ry       = Math.max(SMILEY_EYE_RY * face.eyeScale * face.eyeOpen, SMILEY_EYE_MIN_RY);

    // Slanted lids cover more of the eye the stronger the slant (mirrored so the inner corners match)
    const lidEdgeY = -ry + (Math.abs(face.lidAngle) * 2 * ry * SMILEY_LID_DEPTH);
    const lidH     = (lidEdgeY + ry) + (SMILEY_LID_OVERHANG * rx) + SMILEY_STROKE_W;

    return {
        cx       : (side * SMILEY_EYE_X) + (face.gazeX * SMILEY_GAZE_SHIFT),
        cy       : SMILEY_EYE_Y + (face.gazeY * SMILEY_GAZE_SHIFT),
        rx       : rx,
        ry       : ry,
        lidDeg   : side * face.lidAngle * SMILEY_LID_MAX_DEG,
        lidEdgeY : lidEdgeY,
        lidH     : lidH,
    };
}

// CSS color for an RGB face color, darkened by `shade` (1 keeps it as is)
function rgbString([r, g, b]: RGB, shade: number): string {
    return `rgb(${Math.round(r * shade)} ${Math.round(g * shade)} ${Math.round(b * shade)})`;
}
