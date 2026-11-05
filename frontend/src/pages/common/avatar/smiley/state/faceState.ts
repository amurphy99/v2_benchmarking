/* Face state for the smiley avatar: the numbers a renderer draws, and how two faces blend.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/state/faceState`

The controller (`useFaceController`) moves these numbers over time, and a
renderer (`render_2d/SmileyFace2D`, later a 3D one) only draws them, so a new
renderer reuses every expression and behavior unchanged. Every field is a number
(or an RGB triple) so any two faces can be blended. Eye styles (closed arcs,
spirals, hearts), teeth, and the extras are crossfade amounts for the same
reason. The one exception is `objects`, the hands and hearts the face shows:
each is placed by its face and blends by its own rules (`objects/faceObjects`).
The Map Task map's two numbers (`map`, `mapRaise`) never blend either: no named
face sets them, and the controller's map layer fills them in every frame.

Every named face starts from `SMILEY_BASE_FACE` and lists only what it changes
(`FaceChanges`, turned into a full face by `fullFace`): the expressions
(`actions/faceExpressions.ts`) and the animations' faces
(`actions/faceAnimations.ts`).

*/
import type { FaceObject, ObjectPlacement } from "../objects/faceObjects";
import      { blendObjects, resolveObjects } from "../objects/faceObjects";

// Face fill color, 0-255 per channel (other faces' colors are in `actions/faceExpressions.ts`)
const SMILEY_YELLOW_RGB = [255, 206,  64] as const;

// Default open-eye shape for `eyeOval` (other shapes are in `actions/faceExpressions.ts`)
const SMILEY_EYE_OVAL = 0.54;


// --------------------------------------------------------------------------------
// Face Types
// --------------------------------------------------------------------------------
// Red, green, and blue channels, 0-255 each
export type RGB = [number, number, number];

// Everything a renderer needs to draw one frame of the face
export type FaceState = {
    // Where the eyes and head point
    gazeX  : number;   // Eye direction, -1 (left) to 1 (right)
    gazeY  : number;   // Eye direction, -1 (up) to 1 (down)
    turnX  : number;   // Head turn, -1 (left) to 1 (right)
    turnY  : number;   // Head turn, -1 (up) to 1 (down)
    tilt   : number;   // Head tilt in degrees (positive leans right)
    wander : number;   // Slow drift around that pose while it is held (the controller moves the eyes and head), 0 to 1

    // Eyes
    eyeOpen    : number;   // 0 (closed) to 1 (open)
    eyeScale   : number;   // Eye size multiplier
    eyeInset   : number;   // Eyes moved toward the center line, in SVG units (the brows stay put)
    eyeOval    : number;   // How much taller than wide an open eye is: 0 is a circle (see `SMILEY_EYE_*` in `actions/faceExpressions.ts`)
    lidAngle   : number;   // Eyelid slant, -1 (angry) to 1 (worried)
    squint     : number;   // Lower lids pushed up into the eyes, 0 to 1 (a peering look)
    eyeArc     : number;   // Closed-eye arcs in place of the open eyes, 0 to 1
    eyeArcBend : number;   // Arc shape, 1 (smiling ^ ^, higher bows more) to -1 (sleeping)
    spiral     : number;   // Dizzy spiral eyes in place of the open eyes, 0 to 1
    heartEyes  : number;   // Heart-shaped eyes in place of the open eyes, 0 to 1

    // Eyebrows
    brows     : number;   // Visibility, 0 (hidden) to 1
    browRaise : number;   // Both brows, -1 (lowered) to 1 (raised)
    browAngle : number;   // Slant, -1 (angry, inner ends down) to 1 (worried, inner ends up)
    browAsym  : number;   // One brow up and the other down, -1 (left up) to 1 (right up)
    browPinch : number;   // Brows drawn toward the center line, in SVG units (a furrow; the eyes stay put)

    // Mouth
    mouthCurve   : number;   // -1 (frown) to 1 (smile)
    mouthOpen    : number;   // 0 (closed) to 1 (wide open; big grins go a little past it)
    mouthWidth   : number;   // Width multiplier
    mouthWave    : number;   // Wavy mouth line, 0 to 1
    mouthSquare  : number;   // Opening flattens into a box (grimace), 0 to 1
    mouthRound   : number;   // Opening's corners, 0 (pointed) to 1 (rounded)
    mouthFlatTop : number;   // Upper lip straightened between the corners (a half-circle grin), 0 to 1
    mouthTopBow  : number;   // With a flat top, how far its middle bows down into the mouth, in SVG units
    mouthShift   : number;   // Mouth moved up (negative) or down, in SVG units
    mouthSide    : number;   // Mouth moved left (negative) or right, in SVG units
    mouthSlant   : number;   // Mouth tipped, -1 (left corner lower) to 1 (right corner lower)
    mouthCircle  : number;   // Opening pulled into an exact circle as wide as the mouth, 0 to 1
    mouthEyeFill : number;   // Opening filled with the eyes' color instead of the dark red-brown, 0 to 1
    teethTop     : number;   // Upper teeth, 0 (none) to 1 (fill the top half of the open mouth)
    teethBottom  : number;   // Lower teeth, 0 (none) to 1 (fill the bottom half)
    teethGaps    : number;   // Lines between the teeth, 0 to 1
    tongue       : number;   // Tongue at the bottom of the open mouth, 0 to 1

    // Objects on and around the face (hands, floating hearts), each placed and faded in by its own numbers
    objects : FaceObject[];

    // The Map Task map, held in front of the body (set by the controller's map layer, never by a face)
    map      : number;   // How far into view it is held, 0 (put away below the frame) to 1
    mapRaise : number;   // 0 (lowered to the chin) to 1 (raised to just under the eyes)

    // Extras
    tear      : number;   // Tear drop running down one cheek, 0 to 1
    fearShade : number;   // Blue shading over the top of the face, 0 to 1
    frost     : number;   // White frost over the top of the face, 0 to 1
    icicles   : number;   // Icicles hanging from the bottom of the face, 0 to 1
    zzz       : number;   // Floating sleep Zs, 0 to 1

    // Color and size
    blush    : number;   // Cheek blush, 0 to 1
    faceRgb  : RGB;      // Face fill color
    warmEdge : number;   // Face edge shading, 1 (warm orange, like iOS yellow faces) to 0 (just darker)
    scale    : number;   // Whole-face size multiplier
    offsetX  : number;   // Sideways shift in face radii (positive is right)
    offsetY  : number;   // Vertical shift in face radii (negative is up)

    // Controller clocks in seconds (never blended): one always running (Zs, hearts, spiral spin), and one
    // restarted with each new emotion (the tear, so one drip fits the emotion's hold)
    timeSec       : number;
    expressionSec : number;
};

// What a named face writes: changes to the base face, with its objects placed by spot (`objects/faceObjects`)
export type FaceChanges = Partial<Omit<FaceState, "objects" | "map" | "mapRaise">> & {objects?: ObjectPlacement[]};

// Number fields that blend (everything but the color, the objects, the map, and the clocks)
type FaceNumberKey = Exclude<keyof FaceState, "faceRgb" | "objects" | "map" | "mapRaise" | "timeSec" | "expressionSec">;
const FACE_NUMBER_KEYS: FaceNumberKey[] = [
    "gazeX", "gazeY", "turnX", "turnY", "tilt", "wander",
    "eyeOpen", "eyeScale", "eyeInset", "eyeOval", "lidAngle", "squint", "eyeArc", "eyeArcBend", "spiral", "heartEyes",
    "brows", "browRaise", "browAngle", "browAsym", "browPinch",
    "mouthCurve", "mouthOpen", "mouthWidth", "mouthWave", "mouthSquare", "mouthRound", "mouthFlatTop", "mouthTopBow", "mouthShift", "mouthSide", "mouthSlant", "mouthCircle", "mouthEyeFill", "teethTop", "teethBottom", "teethGaps", "tongue",
    "tear", "fearShade", "frost", "icicles", "zzz",
    "blush", "warmEdge", "scale", "offsetX", "offsetY",
];

// Parts a face shows fully at any strength (shown halfway, a brow or a tear looks like a ghost)
const FACE_FULL_STRENGTH_KEYS: FaceNumberKey[] = ["brows", "eyeArc", "spiral", "heartEyes", "tear", "zzz", "icicles"];


// ================================================================================
// Base Face
// ================================================================================
// Base face every expression starts from (also `Slightly Smiling Face`): open eyes, a mild smile
export const SMILEY_BASE_FACE: FaceState = {
    gazeX         : 0,
    gazeY         : 0,
    turnX         : 0,
    turnY         : 0,
    tilt          : 0,
    wander        : 0,
    eyeOpen       : 1,
    eyeScale      : 1,
    eyeInset      : 0,
    eyeOval       : SMILEY_EYE_OVAL,
    lidAngle      : 0,
    squint        : 0,
    eyeArc        : 0,
    eyeArcBend    : 1,
    spiral        : 0,
    heartEyes     : 0,
    brows         : 0,
    browRaise     : 0,
    browAngle     : 0,
    browAsym      : 0,
    browPinch     : 0,
    mouthCurve    : 0.35,
    mouthOpen     : 0,
    mouthWidth    : 1,
    mouthWave     : 0,
    mouthSquare   : 0,
    mouthRound    : 1,
    mouthFlatTop  : 0,
    mouthTopBow   : 0,
    mouthShift    : 0,
    mouthSide     : 0,
    mouthSlant    : 0,
    mouthCircle   : 0,
    mouthEyeFill  : 0,
    teethTop      : 0,
    teethBottom   : 0,
    teethGaps     : 0,
    tongue        : 0,
    objects       : [],
    map           : 0,
    mapRaise      : 0,
    tear          : 0,
    fearShade     : 0,
    frost         : 0,
    icicles       : 0,
    zzz           : 0,
    blush         : 0,
    faceRgb       : [...SMILEY_YELLOW_RGB],
    warmEdge      : 1,
    scale         : 1,
    offsetX       : 0,
    offsetY       : 0,
    timeSec       : 0,
    expressionSec : 0,
};

// Full face from the base face and an expression's (or animation's) changes to it, its objects placed
export function fullFace(changes: FaceChanges): FaceState {
    return {...SMILEY_BASE_FACE, ...changes, objects: resolveObjects(changes.objects ?? [])};
}



// --------------------------------------------------------------------------------
// Blending
// --------------------------------------------------------------------------------
// Move `t` of the way from one face to another (0 keeps `from`, 1 gives `to`)
export function blendFace(from: FaceState, to: FaceState, t: number): FaceState {
    const mix = (a: number, b: number): number => a + ((b - a) * t);

    // Blend the color per channel, the objects by their own rules, then every number field (the clock comes from `to`)
    const face: FaceState = {...to, faceRgb: [mix(from.faceRgb[0], to.faceRgb[0]), mix(from.faceRgb[1], to.faceRgb[1]), mix(from.faceRgb[2], to.faceRgb[2])], objects: blendObjects(from.objects, to.objects, t)};
    for (const key of FACE_NUMBER_KEYS) face[key] = mix(from[key], to[key]);
    return face;
}

// A face shown only `strength` of the way from another: its shapes and tints move partway, while its on-or-off
// parts (brows, eye styles, the tear, the Zs, the icicles, and its objects) show as they do at full strength
export function faceAtStrength(from: FaceState, face: FaceState, strength: number): FaceState {
    const partway: FaceState = {...blendFace(from, face, strength), objects: face.objects};
    for (const key of FACE_FULL_STRENGTH_KEYS) partway[key] = face[key];
    return partway;
}
