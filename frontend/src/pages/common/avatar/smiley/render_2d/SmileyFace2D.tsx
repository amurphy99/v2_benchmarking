/* Draw one frame of the smiley face as SVG.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/render_2d/SmileyFace2D`

A pure renderer: it draws whatever `FaceState` it is given and holds no timers
or behavior, so a 3D renderer can replace it without touching the controller.
Shape math lives in `faceDrawing2D`; the eyes, mouth, hands, and animated
extras are their own parts, all filled from the gradients defined here.

The face is shaded glossy, like an iOS emoji: bright and nearly white at the
top, the face color through the middle, and a deeper warm shade toward the
bottom edge, with a soft white sheen over the upper half. The features are
brown with a light-to-dark gradient rather than flat black, and every extra
(tongue, hearts, tear, Zs, cheeks) has its own gradient too; the teeth are shaded
by `SmileyMouth2D`, which lays their gradients out from the mouth. The face is
flat, so head turns are faked: the features slide toward the turn and the eye
nearer the edge narrows. Some looks add an overlay: blue shading (fearful), or
frost with a thin dark-blue rim along the top edge, and icicles (cold).

A soft shadow sits on the ground under the face. It follows the face sideways
and with its size, and shrinks and fades as the face lifts off the ground.

*/
import type { ReactElement } from "react";
import      { useId        } from "react";

// From this project
import type { FaceState, RGB                                                               } from "../state/faceState";
import        SmileyExtras2D                                                                 from "./SmileyExtras2D";
import        SmileyEye2D                                                                    from "./SmileyEye2D";
import        SmileyHand2D                                                                   from "./SmileyHand2D";
import        SmileyMouth2D                                                                  from "./SmileyMouth2D";
import type { SmileyPaint                                                                  } from "./faceDrawing2D";
import      { SMILEY_FACE_R, SMILEY_ICICLE_PATHS, SMILEY_TURN_SHIFT_X, SMILEY_TURN_SHIFT_Y } from "./faceDrawing2D";

// Room around the face in the viewport
const SMILEY_VIEW_TOP    = 55;   // Above the face, for bounces and the Zs
const SMILEY_VIEW_SIDE   = 28;   // Beside the face, for sways and the hearts
const SMILEY_VIEW_BOTTOM = 32;   // Below the face, for its shadow, icicles, and a hand on the chin

// Cheeks (a soft round glow that fades to nothing at its edge)
const SMILEY_BLUSH_X   = 60;   // Cheek distance from the center line
const SMILEY_BLUSH_Y   = 9;    // Cheek height
const SMILEY_BLUSH_RX  = 33;   // Cheek half-width
const SMILEY_BLUSH_RY  = 21;   // Cheek half-height
const SMILEY_BLUSH_HEX = "#ff6f8e";

// Face shading (a warm edge keeps this share of each red, green, and blue channel, which turns yellow orange)
const SMILEY_SHADE_TOP_MIX    = 0.6;                         // How far the top of the face mixes toward white
const SMILEY_SHADE_WARM_EDGE  = [0.97, 0.74, 0.42] as const; // Channel shares kept at a warm edge
const SMILEY_SHADE_COOL_EDGE  = 0.72;                        // Share of every channel kept at a plain (cool) edge
const SMILEY_SHADE_BOTTOM_MIX = 0.18;                        // How far the bottom shading darkens the edge color
const SMILEY_SHEEN_OPACITY    = 0.55;                        // White sheen over the upper half, at its brightest
const SMILEY_HAND_EDGE_SHADE  = 0.82;                        // Hand outline, as a share of the face's edge color

// Sheen over the upper half of the face (an ellipse that fades out toward its edges)
const SMILEY_SHEEN_Y   = -50;
const SMILEY_SHEEN_RX  = 76;
const SMILEY_SHEEN_RY  = 46;
const SMILEY_SHEEN_HEX = "#ffffff";

// Feature colors (eyes, brows, mouth lines: dark brown at the top, warmer brown at the bottom)
const SMILEY_FEATURE_TOP_HEX    = "#3b2412";
const SMILEY_FEATURE_BOTTOM_HEX = "#6b4422";
const SMILEY_MOUTH_TOP_HEX      = "#3d1a0c";   // Inside an open mouth, top to bottom
const SMILEY_MOUTH_BOTTOM_HEX   = "#7a2d17";

// Extra colors, light at the top to deep at the bottom
const SMILEY_TONGUE_HEXES = ["#ff9aa7", "#d8455c"] as const;
const SMILEY_HEART_HEXES  = ["#ff8fa6", "#e3123f"] as const;   // Floating hearts
const SMILEY_TEAR_HEXES   = ["#d8f2ff", "#3b97e6"] as const;
const SMILEY_ZZZ_HEXES    = ["#93a6ff", "#3c52cc"] as const;

// Heart eyes: a deeper red, lit from the upper left so they look rounded (center, middle, and edge)
const SMILEY_HEART_EYE_HEXES = ["#ff9db0", "#ee2f4d", "#930720"] as const;

// Overlays over the top of the face (each is strong at the very top and gone by `*_END`)
const SMILEY_FEAR_HEX  = "#6f86ff";   // Fearful blue
const SMILEY_FEAR_END  = "50%";
const SMILEY_FROST_HEX = "#f4fbff";   // Cold-face frost
const SMILEY_FROST_END = "38%";

// Cold-face rim: a thin dark-blue outline along the top edge, over the frost (it fades out by `END`)
const SMILEY_COLD_RIM_HEX = "#2b5f9e";
const SMILEY_COLD_RIM_W   = 2.5;
const SMILEY_COLD_RIM_END = "60%";

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
    const id     = (name: string): string => `smiley-${name}-${baseId}`;
    const url    = (name: string): string => `url(#${id(name)})`;

    // --------------------------------------------------------------------------------
    // Colors
    // --------------------------------------------------------------------------------
    // Face shading: a near-white top, and an edge between warm orange and plain darker by `warmEdge`
    const [r, g, b]  = face.faceRgb;
    const top  : RGB = mixRgb(face.faceRgb, [255, 255, 255], SMILEY_SHADE_TOP_MIX);
    const warm : RGB = [r * SMILEY_SHADE_WARM_EDGE[0], g * SMILEY_SHADE_WARM_EDGE[1], b * SMILEY_SHADE_WARM_EDGE[2]];
    const cool : RGB = [r * SMILEY_SHADE_COOL_EDGE,    g * SMILEY_SHADE_COOL_EDGE,    b * SMILEY_SHADE_COOL_EDGE   ];
    const edge : RGB = mixRgb(cool, warm, face.warmEdge);
    const deep : RGB = mixRgb(edge, [0, 0, 0], SMILEY_SHADE_BOTTOM_MIX);

    // Fills handed to the parts
    const paint: SmileyPaint = {
        feature  : url("feature"),
        mouth    : url("mouth"),
        tongue   : url("tongue"),
        hand     : [rgbString(top), rgbString(face.faceRgb), rgbString(edge)],
        skinEdge : rgbString(mixRgb(edge, [0, 0, 0], 1 - SMILEY_HAND_EDGE_SHADE)),
        heart    : url("heart"),
        heartEye : url("heartEye"),
        ice      : url("ice"),
        tear     : url("tear"),
        zzz      : url("zzz"),
        blush    : url("blush"),
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
        <svg className="no-transition h-full w-full" viewBox={viewBox} role="img" aria-label="Smiley avatar">
            {/* -------------------------------------------------------------------------------- */}
            {/* Gradients */}
            {/* -------------------------------------------------------------------------------- */}
            <defs>
                {/* Face: near-white top, face color through the middle, deep warm edge at the bottom */}
                <radialGradient id={id("face")} cx="50%" cy="38%" r="66%" fx="50%" fy="14%">
                    <stop offset="0%"   stopColor={rgbString(top)}          />
                    <stop offset="48%"  stopColor={rgbString(face.faceRgb)} />
                    <stop offset="82%"  stopColor={rgbString(edge)}         />
                    <stop offset="100%" stopColor={rgbString(deep)}         />
                </radialGradient>
                <radialGradient id={id("sheen")} cx="50%" cy="30%" r="62%">
                    <stop offset="0%"   stopColor={SMILEY_SHEEN_HEX} stopOpacity={SMILEY_SHEEN_OPACITY} />
                    <stop offset="100%" stopColor={SMILEY_SHEEN_HEX} stopOpacity={0}                    />
                </radialGradient>

                {/* Features and extras */}
                {verticalGradient(id("feature"),  [SMILEY_FEATURE_TOP_HEX, SMILEY_FEATURE_BOTTOM_HEX])}
                {verticalGradient(id("mouth"),    [SMILEY_MOUTH_TOP_HEX,   SMILEY_MOUTH_BOTTOM_HEX  ])}
                {verticalGradient(id("ice"),      [SMILEY_ICE_TOP_HEX,     SMILEY_ICE_BOTTOM_HEX    ])}
                {verticalGradient(id("tongue"),   SMILEY_TONGUE_HEXES)}
                {verticalGradient(id("heart"),    SMILEY_HEART_HEXES )}
                {verticalGradient(id("tear"),     SMILEY_TEAR_HEXES  )}
                {verticalGradient(id("zzz"),      SMILEY_ZZZ_HEXES   )}
                <radialGradient id={id("heartEye")} cx="38%" cy="32%" r="78%">
                    <stop offset="0%"   stopColor={SMILEY_HEART_EYE_HEXES[0]} />
                    <stop offset="38%"  stopColor={SMILEY_HEART_EYE_HEXES[1]} />
                    <stop offset="100%" stopColor={SMILEY_HEART_EYE_HEXES[2]} />
                </radialGradient>
                <radialGradient id={id("blush")}>
                    <stop offset="0%"   stopColor={SMILEY_BLUSH_HEX} stopOpacity={0.85} />
                    <stop offset="55%"  stopColor={SMILEY_BLUSH_HEX} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={SMILEY_BLUSH_HEX} stopOpacity={0}    />
                </radialGradient>

                {/* Overlays and the ground shadow */}
                {topOverlayGradient(id("fear"),  SMILEY_FEAR_HEX,     SMILEY_FEAR_END    )}
                {topOverlayGradient(id("frost"), SMILEY_FROST_HEX,    SMILEY_FROST_END   )}
                {topOverlayGradient(id("rim"),   SMILEY_COLD_RIM_HEX, SMILEY_COLD_RIM_END)}
                <radialGradient id={id("shadow")}>
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
                fill    = {url("shadow")}
                opacity = {shadowOpacity}
            />

            <g transform={`translate(${face.offsetX * SMILEY_FACE_R} ${face.offsetY * SMILEY_FACE_R}) rotate(${face.tilt}) scale(${face.scale})`}>
                {/* -------------------------------------------------------------------------------- */}
                {/* Face, Sheen, and Overlays */}
                {/* -------------------------------------------------------------------------------- */}
                <circle r={SMILEY_FACE_R} fill={url("face")} />
                <ellipse cy={SMILEY_SHEEN_Y} rx={SMILEY_SHEEN_RX} ry={SMILEY_SHEEN_RY} fill={url("sheen")} />
                {(face.fearShade > 0) ? <circle r={SMILEY_FACE_R} fill={url("fear")}  opacity={face.fearShade} /> : null}
                {(face.frost     > 0) ? <circle r={SMILEY_FACE_R} fill={url("frost")} opacity={face.frost}     /> : null}
                {(face.frost     > 0) ? <circle r={SMILEY_FACE_R - (SMILEY_COLD_RIM_W / 2)} fill="none" stroke={url("rim")} strokeWidth={SMILEY_COLD_RIM_W} opacity={face.frost} /> : null}
                {(face.icicles   > 0) ? (
                    <g fill={paint.ice} opacity={face.icicles}>
                        {SMILEY_ICICLE_PATHS.map((icicle: string, i: number) => <path key={i} d={icicle} />)}
                    </g>
                ) : null}

                {/* -------------------------------------------------------------------------------- */}
                {/* Features (they slide with the head turn) */}
                {/* -------------------------------------------------------------------------------- */}
                <g transform={`translate(${face.turnX * SMILEY_TURN_SHIFT_X} ${face.turnY * SMILEY_TURN_SHIFT_Y})`}>
                    {/* Cheeks */}
                    <ellipse cx={-SMILEY_BLUSH_X} cy={SMILEY_BLUSH_Y} rx={SMILEY_BLUSH_RX} ry={SMILEY_BLUSH_RY} fill={paint.blush} opacity={face.blush} />
                    <ellipse cx={ SMILEY_BLUSH_X} cy={SMILEY_BLUSH_Y} rx={SMILEY_BLUSH_RX} ry={SMILEY_BLUSH_RY} fill={paint.blush} opacity={face.blush} />

                    {/* Eyes, mouth, animated extras, and the hands in front of them all */}
                    <SmileyEye2D    side={-1} face={face} paint={paint} />
                    <SmileyEye2D    side={ 1} face={face} paint={paint} />
                    <SmileyMouth2D            face={face} paint={paint} />
                    <SmileyExtras2D           face={face} paint={paint} />
                    <SmileyHand2D             face={face} paint={paint} />
                </g>
            </g>
        </svg>
    );
}


// --------------------------------------------------------------------------------
// Gradient Helpers
// --------------------------------------------------------------------------------
// Top-to-bottom gradient across whatever shape uses it, through evenly spaced colors
function verticalGradient(id: string, hexes: readonly string[]): ReactElement {
    return (
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            {hexes.map((hex: string, i: number) => <stop key={hex} offset={`${(100 * i) / (hexes.length - 1)}%`} stopColor={hex} />)}
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
