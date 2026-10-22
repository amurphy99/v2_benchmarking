/* Draw one frame of the smiley face as SVG.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/SmileyFace2D`

A pure renderer: it draws whatever `FaceState` it is given and holds no timers
or behavior, so a 3D renderer can replace it without touching the controller.
Shape math lives in `faceDrawing2D`; each eye is a `SmileyEye2D` and the tear,
Zs, and hearts are `SmileyExtras2D`.

The face is shaded like an iOS emoji (bright in the middle, warm orange at the
edge, no outline), with a small highlight near the top. The face is flat, so
head turns are faked: the features slide toward the turn and the eye nearer the
edge narrows. The fearful look adds blue shading over the top of the face.

A soft shadow sits on the ground under the face. It follows the face sideways
and with its size, and shrinks and fades as the face lifts off the ground.

*/
import type { ReactElement } from "react";
import      { useId        } from "react";

// From this project
import        SmileyExtras2D                                               from "./SmileyExtras2D";
import        SmileyEye2D                                                  from "./SmileyEye2D";
import      { SMILEY_FACE_R, SMILEY_FEATURE_HEX, SMILEY_FEATURE_STROKE_W } from "./faceDrawing2D";
import      { SMILEY_MOUTH_Y, SMILEY_TURN_SHIFT_X, SMILEY_TURN_SHIFT_Y   } from "./faceDrawing2D";
import      { mouthPath                                                  } from "./faceDrawing2D";
import type { FaceState, RGB                                             } from "./faceState";

// Room around the face in the viewport
const SMILEY_VIEW_TOP    = 55;   // Above the face, for bounces and the Zs
const SMILEY_VIEW_SIDE   = 28;   // Beside the face, for sways and the hearts
const SMILEY_VIEW_BOTTOM = 30;   // Below the face, for its shadow

// Cheeks
const SMILEY_BLUSH_X           = 56;    // Cheek distance from the center line
const SMILEY_BLUSH_Y           = 14;    // Cheek height
const SMILEY_BLUSH_RX          = 17;    // Cheek half-width
const SMILEY_BLUSH_RY          = 10;    // Cheek half-height
const SMILEY_BLUSH_HEX         = "#ff6f8e";
const SMILEY_BLUSH_MAX_OPACITY = 0.7;   // Cheek opacity at full blush

// Highlight (high on the upper left, clear of the eyes and brows)
const SMILEY_SHINE_X       = -44;   // Highlight center
const SMILEY_SHINE_Y       = -77;
const SMILEY_SHINE_RX      = 16;    // Highlight half-width and half-height
const SMILEY_SHINE_RY      = 7;
const SMILEY_SHINE_DEG     = -30;   // Highlight slant
const SMILEY_SHINE_HEX     = "#ffffff";
const SMILEY_SHINE_OPACITY = 0.45;

// Face shading (the edge keeps this share of each red, green, and blue channel, which warms it toward orange)
const SMILEY_SHADE_LIGHT_MIX = 0.35;                        // How far the middle of the face mixes toward white
const SMILEY_SHADE_EDGE      = [0.97, 0.78, 0.5] as const;  // Channel shares kept at the edge
const SMILEY_FEAR_HEX        = "#6f86ff";                   // Fearful shading over the top of the face
const SMILEY_FEAR_OPACITY    = 1;                           // Fearful shading at the very top (it holds most of that to 30%, then fades by 50%)

// Ground shadow (lift is how far the face is above its resting height, in face radii)
const SMILEY_SHADOW_Y           = 116;    // Shadow center, just below the resting face
const SMILEY_SHADOW_RX          = 72;     // Shadow half-width and half-height with the face resting on the ground
const SMILEY_SHADOW_RY          = 10;
const SMILEY_SHADOW_LIFT_SHRINK = 1.2;    // Shadow size lost per face radius of lift
const SMILEY_SHADOW_LIFT_FADE   = 1.5;    // Shadow opacity lost per face radius of lift
const SMILEY_SHADOW_HEX         = "#000000";
const SMILEY_SHADOW_OPACITY     = 0.28;   // Shadow opacity at its center (it fades to clear at the edge)


// ================================================================================
// Smiley Face (2D)
// ================================================================================
// Render one face state as an SVG smiley that fills its box
export default function SmileyFace2D({face}: {
    face : FaceState;   // Combined face for this frame (from `useFaceController`)
}): ReactElement {
    // Gradient ids, unique per avatar on the page (React's ids may hold characters `url(#...)` rejects)
    const baseId   = useId().replace(/[^a-zA-Z0-9_-]/g, "");
    const shadeId  = `smiley-shade-${baseId}`;
    const fearId   = `smiley-fear-${baseId}`;
    const shadowId = `smiley-shadow-${baseId}`;

    // Face shading colors and the viewport around the face
    const [r, g, b] = face.faceRgb;
    const light: RGB = mixRgb(face.faceRgb, [255, 255, 255], SMILEY_SHADE_LIGHT_MIX);
    const edge:  RGB = [r * SMILEY_SHADE_EDGE[0], g * SMILEY_SHADE_EDGE[1], b * SMILEY_SHADE_EDGE[2]];
    const viewBox = `${-(SMILEY_FACE_R + SMILEY_VIEW_SIDE)} ${-(SMILEY_FACE_R + SMILEY_VIEW_TOP)} ${2 * (SMILEY_FACE_R + SMILEY_VIEW_SIDE)} ${(2 * SMILEY_FACE_R) + SMILEY_VIEW_TOP + SMILEY_VIEW_BOTTOM}`;

    // Shadow follows the face's size, and shrinks and fades as the face lifts off the ground
    const lift          = Math.max(0, -face.offsetY);
    const shadowSpread  = face.scale * Math.max(0, 1 - (lift * SMILEY_SHADOW_LIFT_SHRINK));
    const shadowOpacity = Math.max(0, 1 - (lift * SMILEY_SHADOW_LIFT_FADE));

    return (
        <svg className="h-full w-full" viewBox={viewBox} role="img" aria-label="Smiley avatar">
            {/* -------------------------------------------------------------------------------- */}
            {/* Gradients */}
            {/* -------------------------------------------------------------------------------- */}
            <defs>
                <radialGradient id={shadeId} cx="50%" cy="40%" r="60%" fx="50%" fy="30%">
                    <stop offset="0%"   stopColor={rgbString(light)}        />
                    <stop offset="60%"  stopColor={rgbString(face.faceRgb)} />
                    <stop offset="100%" stopColor={rgbString(edge)}         />
                </radialGradient>
                <linearGradient id={fearId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"  stopColor={SMILEY_FEAR_HEX} stopOpacity={SMILEY_FEAR_OPACITY}        />
                    <stop offset="30%" stopColor={SMILEY_FEAR_HEX} stopOpacity={0.8 * SMILEY_FEAR_OPACITY} />
                    <stop offset="50%" stopColor={SMILEY_FEAR_HEX} stopOpacity={0}                          />
                </linearGradient>
                <radialGradient id={shadowId}>
                    <stop offset="0%"   stopColor={SMILEY_SHADOW_HEX} stopOpacity={SMILEY_SHADOW_OPACITY} />
                    <stop offset="100%" stopColor={SMILEY_SHADOW_HEX} stopOpacity={0}                     />
                </radialGradient>
            </defs>

            {/* -------------------------------------------------------------------------------- */}
            {/* Ground Shadow */}
            {/* -------------------------------------------------------------------------------- */}
            {/* Outside the face group, so it never tilts or lifts with the face */}
            <ellipse
                cx      = {face.offsetX * SMILEY_FACE_R}
                cy      = {SMILEY_SHADOW_Y}
                rx      = {SMILEY_SHADOW_RX * shadowSpread}
                ry      = {SMILEY_SHADOW_RY * shadowSpread}
                fill    = {`url(#${shadowId})`}
                opacity = {shadowOpacity}
            />

            <g transform={`translate(${face.offsetX * SMILEY_FACE_R} ${face.offsetY * SMILEY_FACE_R}) rotate(${face.tilt}) scale(${face.scale})`}>
                {/* -------------------------------------------------------------------------------- */}
                {/* Face */}
                {/* -------------------------------------------------------------------------------- */}
                <circle r={SMILEY_FACE_R} fill={`url(#${shadeId})`} />
                {(face.fearShade > 0) ? <circle r={SMILEY_FACE_R} fill={`url(#${fearId})`} opacity={face.fearShade} /> : null}

                {/* -------------------------------------------------------------------------------- */}
                {/* Features (they slide with the head turn) */}
                {/* -------------------------------------------------------------------------------- */}
                <g transform={`translate(${face.turnX * SMILEY_TURN_SHIFT_X} ${face.turnY * SMILEY_TURN_SHIFT_Y})`}>
                    {/* Cheeks */}
                    <ellipse cx={-SMILEY_BLUSH_X} cy={SMILEY_BLUSH_Y} rx={SMILEY_BLUSH_RX} ry={SMILEY_BLUSH_RY} fill={SMILEY_BLUSH_HEX} opacity={face.blush * SMILEY_BLUSH_MAX_OPACITY} />
                    <ellipse cx={ SMILEY_BLUSH_X} cy={SMILEY_BLUSH_Y} rx={SMILEY_BLUSH_RX} ry={SMILEY_BLUSH_RY} fill={SMILEY_BLUSH_HEX} opacity={face.blush * SMILEY_BLUSH_MAX_OPACITY} />

                    {/* Eyes and brows */}
                    <SmileyEye2D side={-1} face={face} />
                    <SmileyEye2D side={ 1} face={face} />

                    {/* Mouth */}
                    <path
                        d              = {mouthPath(face)}
                        transform      = {`translate(0 ${SMILEY_MOUTH_Y})`}
                        fill           = {SMILEY_FEATURE_HEX}
                        stroke         = {SMILEY_FEATURE_HEX}
                        strokeWidth    = {SMILEY_FEATURE_STROKE_W}
                        strokeLinecap  = "round"
                        strokeLinejoin = "round"
                    />

                    {/* Tear, Zs, and hearts */}
                    <SmileyExtras2D face={face} />
                </g>

                {/* -------------------------------------------------------------------------------- */}
                {/* Highlight (drawn last, so it sits on top) */}
                {/* -------------------------------------------------------------------------------- */}
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
// Color Helpers
// --------------------------------------------------------------------------------
// Move `amount` of the way from one color to another
function mixRgb([r, g, b]: RGB, [toR, toG, toB]: RGB, amount: number): RGB {
    return [r + ((toR - r) * amount), g + ((toG - g) * amount), b + ((toB - b) * amount)];
}

// CSS color for an RGB triple
function rgbString([r, g, b]: RGB): string {
    return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;
}
