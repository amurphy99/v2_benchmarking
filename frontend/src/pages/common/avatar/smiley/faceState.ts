/* Face state for the smiley avatar: the numbers a renderer draws, and the mood presets.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/faceState`

The controller (`useFaceController`) moves these numbers over time, and a
renderer (`SmileyFace2D`, later a 3D one) only draws them, so a new renderer
reuses every expression and behavior unchanged. Every field is a number (or an
RGB triple) so any two faces can be blended.

The presets are starting values, meant to be tuned on the avatar demo page.

*/
// Face fill colors, 0-255 per channel
const SMILEY_YELLOW_RGB = [255, 206,  64] as const;   // Default face
const SMILEY_SICK_RGB   = [178, 214,  98] as const;   // Sick (green tint)
const SMILEY_ANGRY_RGB  = [255, 140,  70] as const;   // Angry (red-orange tint)


// --------------------------------------------------------------------------------
// Face Types
// --------------------------------------------------------------------------------
// Red, green, and blue channels, 0-255 each
export type RGB = [number, number, number];

// Everything a renderer needs to draw one frame of the face
export type FaceState = {
    // Where the eyes and head point
    gazeX : number;   // Eye direction, -1 (left) to 1 (right)
    gazeY : number;   // Eye direction, -1 (up) to 1 (down)
    turnX : number;   // Head turn, -1 (left) to 1 (right)
    turnY : number;   // Head turn, -1 (up) to 1 (down)
    tilt  : number;   // Head tilt in degrees (positive leans right)

    // Eyes
    eyeOpen  : number;   // 0 (closed) to 1 (open)
    eyeScale : number;   // Eye size multiplier
    lidAngle : number;   // Eyelid slant, -1 (angry) to 1 (worried)

    // Mouth
    mouthCurve : number;   // -1 (frown) to 1 (smile)
    mouthOpen  : number;   // 0 (closed) to 1 (wide open)
    mouthWidth : number;   // Width multiplier

    // Color and size
    blush   : number;   // Cheek blush, 0 to 1
    faceRgb : RGB;      // Face fill color
    scale   : number;   // Whole-face size multiplier
    offsetX : number;   // Sideways shift in face radii (positive is right)
    offsetY : number;   // Vertical shift in face radii (negative is up)
};

// Number fields of a face (everything but the color), in one list for blending
type FaceNumberKey = Exclude<keyof FaceState, "faceRgb">;
const FACE_NUMBER_KEYS: FaceNumberKey[] = [
    "gazeX", "gazeY", "turnX", "turnY", "tilt",
    "eyeOpen", "eyeScale", "lidAngle",
    "mouthCurve", "mouthOpen", "mouthWidth",
    "blush", "scale", "offsetX", "offsetY",
];


// ================================================================================
// Expressions
// ================================================================================
// Resting face: open eyes and a mild smile
export const SMILEY_NEUTRAL_FACE: FaceState = {
    gazeX      : 0,
    gazeY      : 0,
    turnX      : 0,
    turnY      : 0,
    tilt       : 0,
    eyeOpen    : 1,
    eyeScale   : 1,
    lidAngle   : 0,
    mouthCurve : 0.35,
    mouthOpen  : 0,
    mouthWidth : 1,
    blush      : 0,
    faceRgb    : [...SMILEY_YELLOW_RGB],
    scale      : 1,
    offsetX    : 0,
    offsetY    : 0,
};

// How each mood differs from Neutral (keys are the backend's mood labels, plus admin-only Angry)
const SMILEY_EXPRESSIONS: Record<string, Partial<FaceState>> = {
    Neutral   : {},
    Happy     : {mouthCurve:  1.00,                                      eyeOpen:  0.75,                                                                         blush:  0.25},
    Love      : {mouthCurve:  0.85,                                      eyeOpen:  0.65,                                                               tilt: -6, blush:  0.90},
    Sad       : {mouthCurve: -0.70,                                      eyeOpen:  0.80,                  lidAngle:  0.70,               gazeY:  0.45},
    Grumpy    : {mouthCurve: -0.55,                   mouthWidth:  0.70, eyeOpen:  0.55,                  lidAngle: -0.80},
    Scared    : {mouthCurve: -0.30, mouthOpen:  0.25, mouthWidth:  0.60,                 eyeScale:  1.30, lidAngle:  0.50,                                                     scale:  0.92},
    Sick      : {mouthCurve: -0.40,                                      eyeOpen:  0.55,                  lidAngle:  0.30,                                                                   faceRgb: [...SMILEY_SICK_RGB]},
    Surprised : {mouthCurve: -0.35, mouthOpen:  0.85, mouthWidth:  0.45,                 eyeScale:  1.30},
    Thinking  : {mouthCurve:  0.05,                   mouthWidth:  0.60,                                                   gazeX: -0.60, gazeY: -0.60, tilt:  8},
    Tired     : {mouthCurve:  0.00,                   mouthWidth:  0.80, eyeOpen:  0.35,                                                 gazeY:  0.25},
    Angry     : {mouthCurve: -0.65,                                      eyeOpen:  0.70,                  lidAngle: -1.00,                                                                   faceRgb: [...SMILEY_ANGRY_RGB]},
};

// Full face for a mood label, matched case-insensitively (unknown labels show Neutral)
export function expressionFor(label: string): FaceState {
    const mood = Object.keys(SMILEY_EXPRESSIONS).find((key: string) => key.toLowerCase() === label.toLowerCase());
    return (mood === undefined) ? SMILEY_NEUTRAL_FACE : {...SMILEY_NEUTRAL_FACE, ...SMILEY_EXPRESSIONS[mood]};
}


// --------------------------------------------------------------------------------
// Blending
// --------------------------------------------------------------------------------
// Move `t` of the way from one face to another (0 keeps `from`, 1 gives `to`)
export function blendFace(from: FaceState, to: FaceState, t: number): FaceState {
    const mix = (a: number, b: number): number => a + ((b - a) * t);

    // Blend the color per channel, then every number field
    const face: FaceState = {...to, faceRgb: [mix(from.faceRgb[0], to.faceRgb[0]), mix(from.faceRgb[1], to.faceRgb[1]), mix(from.faceRgb[2], to.faceRgb[2])]};
    for (const key of FACE_NUMBER_KEYS) face[key] = mix(from[key], to[key]);
    return face;
}
