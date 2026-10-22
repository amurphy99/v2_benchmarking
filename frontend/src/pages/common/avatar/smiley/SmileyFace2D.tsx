/* Draw one frame of the smiley face as SVG.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/SmileyFace2D`

A pure renderer: it draws whatever `FaceState` it is given and holds no timers
or behavior, so a 3D renderer can replace it without touching the controller.
Shape math lives in `faceDrawing2D`; the eyes, mouth, hands, and animated
extras are their own parts, all filled from the gradients defined here.

The face is shaded like an iOS emoji (bright in the middle, warm orange at the
edge, no outline), with a small highlight near the top. The features are brown
with a light-to-dark gradient rather than flat black, and an open mouth is a
deep red-brown. The face is flat, so head turns are faked: the features slide
toward the turn and the eye nearer the edge narrows. Some looks add an overlay:
blue shading (fearful), or frost and icicles (cold).

A soft shadow sits on the ground under the face. It follows the face sideways
and with its size, and shrinks and fades as the face lifts off the ground.

*/
import type { ReactElement } from "react";
import      { useId        } from "react";

// From this project
import        SmileyEye2D                                                                    from "./SmileyEye2D";
import        SmileyExtras2D                                                                 from "./SmileyExtras2D";
import        SmileyHand2D                                                                   from "./SmileyHand2D";
import        SmileyMouth2D                                                                  from "./SmileyMouth2D";
import type { SmileyPaint                                                                  } from "./faceDrawing2D";
import      { SMILEY_FACE_R, SMILEY_ICICLE_PATHS, SMILEY_TURN_SHIFT_X, SMILEY_TURN_SHIFT_Y } from "./faceDrawing2D";
import type { FaceState, RGB                                                               } from "./faceState";

// Room around the face in the viewport
const SMILEY_VIEW_TOP    = 55;   // Above the face, for bounces and the Zs
const SMILEY_VIEW_SIDE   = 28;   // Beside the face, for sways and the hearts
const SMILEY_VIEW_BOTTOM = 32;   // Below the face, for its shadow, icicles, and a hand on the chin

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

// Face shading (a warm edge keeps this share of each red, green, and blue channel, which turns yellow orange)
const SMILEY_SHADE_LIGHT_MIX = 0.35;                        // How far the middle of the face mixes toward white
const SMILEY_SHADE_WARM_EDGE = [0.97, 0.78, 0.5] as const;  // Channel shares kept at a warm edge
const SMILEY_SHADE_COOL_EDGE = 0.75;                        // Share of every channel kept at a plain (cool) edge
const SMILEY_HAND_EDGE_SHADE = 0.85;                        // Hand outline, as a share of the face's edge color

// Feature colors (eyes, brows, closed mouths: dark brown at the top, warmer brown at the bottom)
const SMILEY_FEATURE_TOP_HEX    = "#3b2412";
const SMILEY_FEATURE_BOTTOM_HEX = "#6b4422";
const SMILEY_MOUTH_TOP_HEX      = "#3d1a0c";   // Inside an open mouth, top to bottom
const SMILEY_MOUTH_BOTTOM_HEX   = "#7a2d17";
const SMILEY_TEETH_TOP_HEX      = "#ffffff";   // Teeth, top to bottom
const SMILEY_TEETH_BOTTOM_HEX   = "#e6dfd3";

// Overlays over the top of the face (each is strong at the very top and gone by `*_END`)
const SMILEY_FEAR_HEX   = "#6f86ff";   // Fearful blue
const SMILEY_FEAR_END   = "50%";
const SMILEY_FROST_HEX  = "#f4fbff";   // Cold-face frost
const SMILEY_FROST_END  = "38%";

// Icicle colors, base to tip
const SMILEY_ICE_TOP_HEX    = "#ffffff";
const SMILEY_ICE_BOTTOM_HEX = "#9fd7f6";

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
    const baseId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
    const ids    = {
        shade   : `smiley-shade-${baseId}`,
        feature : `smiley-feature-${baseId}`,
        mouth   : `smiley-mouth-${baseId}`,
        teeth   : `smiley-teeth-${baseId}`,
        fear    : `smiley-fear-${baseId}`,
        frost   : `smiley-frost-${baseId}`,
        ice     : `smiley-ice-${baseId}`,
        shadow  : `smiley-shadow-${baseId}`,
    };

    // --------------------------------------------------------------------------------
    // Colors
    // --------------------------------------------------------------------------------
    // Face shading: a light middle, and an edge between warm orange and plain darker by `warmEdge`
    const [r, g, b]  = face.faceRgb;
    const light: RGB = mixRgb(face.faceRgb, [255, 255, 255], SMILEY_SHADE_LIGHT_MIX);
    const warm : RGB = [r * SMILEY_SHADE_WARM_EDGE[0], g * SMILEY_SHADE_WARM_EDGE[1], b * SMILEY_SHADE_WARM_EDGE[2]];
    const cool : RGB = [r * SMILEY_SHADE_COOL_EDGE,    g * SMILEY_SHADE_COOL_EDGE,    b * SMILEY_SHADE_COOL_EDGE   ];
    const edge : RGB = mixRgb(cool, warm, face.warmEdge);

    // Fills handed to the parts
    const paint: SmileyPaint = {
        feature  : `url(#${ids.feature})`,
        mouth    : `url(#${ids.mouth})`,
        teeth    : `url(#${ids.teeth})`,
        skin     : `url(#${ids.shade})`,
        skinEdge : rgbString(mixRgb(edge, [0, 0, 0], 1 - SMILEY_HAND_EDGE_SHADE)),
    };

    // --------------------------------------------------------------------------------
    // Layout
    // --------------------------------------------------------------------------------
    // Viewport around the face
    const viewBox = `${-(SMILEY_FACE_R + SMILEY_VIEW_SIDE)} ${-(SMILEY_FACE_R + SMILEY_VIEW_TOP)} ${2 * (SMILEY_FACE_R + SMILEY_VIEW_SIDE)} ${(2 * SMILEY_FACE_R) + SMILEY_VIEW_TOP + SMILEY_VIEW_BOTTOM}`;

    // Shadow follows the face's size, and shrinks and fades as the face lifts off the ground
    const lift          = Math.max(0, -face.offsetY);
    const shadowSpread  = face.scale * Math.max(0, 1 - (lift * SMILEY_SHADOW_LIFT_SHRINK));
    const shadowOpacity = Math.max(0, 1 - (lift * SMILEY_SHADOW_LIFT_FADE));

    // --------------------------------------------------------------------------------
    // Render
    // --------------------------------------------------------------------------------
    return (
        <svg className="h-full w-full" viewBox={viewBox} role="img" aria-label="Smiley avatar">
            {/* -------------------------------------------------------------------------------- */}
            {/* Gradients */}
            {/* -------------------------------------------------------------------------------- */}
            <defs>
                <radialGradient id={ids.shade} cx="50%" cy="40%" r="60%" fx="50%" fy="30%">
                    <stop offset="0%"   stopColor={rgbString(light)}        />
                    <stop offset="60%"  stopColor={rgbString(face.faceRgb)} />
                    <stop offset="100%" stopColor={rgbString(edge)}         />
                </radialGradient>
                {verticalGradient(ids.feature, SMILEY_FEATURE_TOP_HEX, SMILEY_FEATURE_BOTTOM_HEX)}
                {verticalGradient(ids.mouth,   SMILEY_MOUTH_TOP_HEX,   SMILEY_MOUTH_BOTTOM_HEX  )}
                {verticalGradient(ids.teeth,   SMILEY_TEETH_TOP_HEX,   SMILEY_TEETH_BOTTOM_HEX  )}
                {verticalGradient(ids.ice,     SMILEY_ICE_TOP_HEX,     SMILEY_ICE_BOTTOM_HEX    )}
                {topOverlayGradient(ids.fear,  SMILEY_FEAR_HEX,  SMILEY_FEAR_END )}
                {topOverlayGradient(ids.frost, SMILEY_FROST_HEX, SMILEY_FROST_END)}
                <radialGradient id={ids.shadow}>
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
                fill    = {`url(#${ids.shadow})`}
                opacity = {shadowOpacity}
            />

            <g transform={`translate(${face.offsetX * SMILEY_FACE_R} ${face.offsetY * SMILEY_FACE_R}) rotate(${face.tilt}) scale(${face.scale})`}>
                {/* -------------------------------------------------------------------------------- */}
                {/* Face and Overlays */}
                {/* -------------------------------------------------------------------------------- */}
                <circle r={SMILEY_FACE_R} fill={paint.skin} />
                {(face.fearShade > 0) ? <circle r={SMILEY_FACE_R} fill={`url(#${ids.fear})`}  opacity={face.fearShade} /> : null}
                {(face.frost     > 0) ? <circle r={SMILEY_FACE_R} fill={`url(#${ids.frost})`} opacity={face.frost}     /> : null}
                {(face.icicles   > 0) ? (
                    <g fill={`url(#${ids.ice})`} opacity={face.icicles}>
                        {SMILEY_ICICLE_PATHS.map((icicle: string, i: number) => <path key={i} d={icicle} />)}
                    </g>
                ) : null}

                {/* -------------------------------------------------------------------------------- */}
                {/* Features (they slide with the head turn) */}
                {/* -------------------------------------------------------------------------------- */}
                <g transform={`translate(${face.turnX * SMILEY_TURN_SHIFT_X} ${face.turnY * SMILEY_TURN_SHIFT_Y})`}>
                    {/* Cheeks */}
                    <ellipse cx={-SMILEY_BLUSH_X} cy={SMILEY_BLUSH_Y} rx={SMILEY_BLUSH_RX} ry={SMILEY_BLUSH_RY} fill={SMILEY_BLUSH_HEX} opacity={face.blush * SMILEY_BLUSH_MAX_OPACITY} />
                    <ellipse cx={ SMILEY_BLUSH_X} cy={SMILEY_BLUSH_Y} rx={SMILEY_BLUSH_RX} ry={SMILEY_BLUSH_RY} fill={SMILEY_BLUSH_HEX} opacity={face.blush * SMILEY_BLUSH_MAX_OPACITY} />

                    {/* Eyes, mouth, animated extras, and the hands in front of them all */}
                    <SmileyEye2D    side={-1} face={face} paint={paint} />
                    <SmileyEye2D    side={ 1} face={face} paint={paint} />
                    <SmileyMouth2D            face={face} paint={paint} />
                    <SmileyExtras2D           face={face}               />
                    <SmileyHand2D             face={face} paint={paint} />
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
// Gradient Helpers
// --------------------------------------------------------------------------------
// Top-to-bottom gradient across whatever shape uses it
function verticalGradient(id: string, topHex: string, bottomHex: string): ReactElement {
    return (
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={topHex}    />
            <stop offset="100%" stopColor={bottomHex} />
        </linearGradient>
    );
}

// Overlay color strong over the top of a shape, holding most of its strength to 30%, then gone by `end`
function topOverlayGradient(id: string, hex: string, end: string): ReactElement {
    return (
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor={hex} stopOpacity={1}   />
            <stop offset="30%" stopColor={hex} stopOpacity={0.8} />
            <stop offset={end} stopColor={hex} stopOpacity={0}   />
        </linearGradient>
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
