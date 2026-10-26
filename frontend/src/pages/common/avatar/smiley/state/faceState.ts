/* Face state for the smiley avatar: the numbers a renderer draws, and the expression catalog.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/state/faceState`

The controller (`useFaceController`) moves these numbers over time, and a
renderer (`SmileyFace2D`, later a 3D one) only draws them, so a new renderer
reuses every expression and behavior unchanged. Every field is a number (or an
RGB triple) so any two faces can be blended. Eye styles (closed arcs, spirals,
hearts), teeth, hands, and the other extras are crossfade amounts for the same
reason.

An expression is a set of field values, so a new one is a combination of the
existing shapes and extras: one line in `SMILEY_EXPRESSIONS`. Expressions are
named after the iOS emoji they borrow from. They are the "Expressions" category
of the smiley's public actions: faces that only change the face's shapes. Faces
combined with movement or breath (Ponder, Yawn) are animations
(`faceAnimations.ts`), and the moods and the lookup that matches an incoming
action's name to any category are in `smileyActions.ts`.

"Neutral" is not a fixed face: it is whichever expression the controller is
resting on (`Slightly Smiling Face` unless the page picks another).

Every expression sets a brow pose even when it keeps the brows hidden, so the
"Smiley + eyebrows" avatar (which always shows them) still gets a fitting brow.

*/
// Face fill colors, 0-255 per channel
const SMILEY_YELLOW_RGB = [255, 206,  64] as const;   // Default face
const SMILEY_SICK_RGB   = [196, 222, 110] as const;   // Light green, for the sick spiral face
const SMILEY_ANGRY_RGB  = [255, 160,  60] as const;   // Orange, for the angry face
const SMILEY_POUT_RGB   = [240, 100,  75] as const;   // Red, for the red angry face
const SMILEY_COLD_RGB   = [110, 190, 245] as const;   // Blue, for the cold face

// Open-eye shapes for `eyeOval`: how much taller than wide an eye is (the eye keeps its area as it changes)
const SMILEY_EYE_CIRCLE      = 0;
const SMILEY_EYE_SLIGHT_OVAL = 0.25;
const SMILEY_EYE_OVAL        = 0.54;   // Default
const SMILEY_EYE_TALL_OVAL   = 0.85;

// Grin shared by the open-mouthed smiling faces: a large half circle with a gently bowed top, set high
const SMILEY_GRIN: Partial<FaceState> = {mouthCurve: 0.35, mouthOpen: 1.1, mouthWidth: 1.12, mouthFlatTop: 1, mouthTopBow: 4, mouthShift: -14};

// Expression the face rests on until the page picks another
export const SMILEY_DEFAULT_RESTING_EXPRESSION = "Slightly Smiling Face";


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
    eyeOval    : number;   // How much taller than wide an open eye is: 0 is a circle (see `SMILEY_EYE_*`)
    lidAngle   : number;   // Eyelid slant, -1 (angry) to 1 (worried)
    eyeArc     : number;   // Closed-eye arcs in place of the open eyes, 0 to 1
    eyeArcBend : number;   // Arc shape, 1 (smiling ^ ^, higher bows more) to -1 (sleeping)
    spiral     : number;   // Dizzy spiral eyes in place of the open eyes, 0 to 1
    heartEyes  : number;   // Heart-shaped eyes in place of the open eyes, 0 to 1

    // Eyebrows
    brows     : number;   // Visibility, 0 (hidden) to 1
    browRaise : number;   // Both brows, -1 (lowered) to 1 (raised)
    browAngle : number;   // Slant, -1 (angry, inner ends down) to 1 (worried, inner ends up)
    browAsym  : number;   // One brow up and the other down, -1 (left up) to 1 (right up)

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

    // Hands (an amount fades each pose in; the nudges move whichever pose is showing)
    handMouth : number;   // Hand held over the mouth, 0 to 1
    handChin  : number;   // Hand on the chin with one finger raised, 0 to 1
    handDX    : number;   // Sideways nudge, in SVG units
    handDY    : number;   // Vertical nudge, in SVG units
    handTilt  : number;   // Extra rotation, in degrees

    // Extras
    tear      : number;   // Tear drop running down one cheek, 0 to 1
    fearShade : number;   // Blue shading over the top of the face, 0 to 1
    frost     : number;   // White frost over the top of the face, 0 to 1
    icicles   : number;   // Icicles hanging from the bottom of the face, 0 to 1
    zzz       : number;   // Floating sleep Zs, 0 to 1
    hearts    : number;   // Small hearts floating around the head, 0 to 1

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

// Number fields that blend (everything but the color and the clocks)
type FaceNumberKey = Exclude<keyof FaceState, "faceRgb" | "timeSec" | "expressionSec">;
const FACE_NUMBER_KEYS: FaceNumberKey[] = [
    "gazeX", "gazeY", "turnX", "turnY", "tilt", "wander",
    "eyeOpen", "eyeScale", "eyeInset", "eyeOval", "lidAngle", "eyeArc", "eyeArcBend", "spiral", "heartEyes",
    "brows", "browRaise", "browAngle", "browAsym",
    "mouthCurve", "mouthOpen", "mouthWidth", "mouthWave", "mouthSquare", "mouthRound", "mouthFlatTop", "mouthTopBow", "mouthShift", "mouthSide", "mouthSlant", "mouthCircle", "mouthEyeFill", "teethTop", "teethBottom", "teethGaps", "tongue",
    "handMouth", "handChin", "handDX", "handDY", "handTilt",
    "tear", "fearShade", "frost", "icicles", "zzz", "hearts",
    "blush", "warmEdge", "scale", "offsetX", "offsetY",
];

// One named expression: the emoji it borrows from, and how it differs from the base face
type Expression = {emoji: string; face: Partial<FaceState>};


// ================================================================================
// Expressions
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
    eyeArc        : 0,
    eyeArcBend    : 1,
    spiral        : 0,
    heartEyes     : 0,
    brows         : 0,
    browRaise     : 0,
    browAngle     : 0,
    browAsym      : 0,
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
    handMouth     : 0,
    handChin      : 0,
    handDX        : 0,
    handDY        : 0,
    handTilt      : 0,
    tear          : 0,
    fearShade     : 0,
    frost         : 0,
    icicles       : 0,
    zzz           : 0,
    hearts        : 0,
    blush         : 0,
    faceRgb       : [...SMILEY_YELLOW_RGB],
    warmEdge      : 1,
    scale         : 1,
    offsetX       : 0,
    offsetY       : 0,
    timeSec       : 0,
    expressionSec : 0,
};

// Every named expression (names follow iOS emoji names)
const SMILEY_EXPRESSIONS: Record<string, Expression> = {
    // Calm
    "Slightly Smiling Face" : {emoji: "🙂", face: {}},
    "Neutral Face"          : {emoji: "😐", face: {mouthCurve: 0, mouthWidth: 0.8}},

    // Happy
    "Grinning Face"                  : {emoji: "😀", face: {...SMILEY_GRIN, teethTop: 0.6, tongue: 0.6, eyeScale: 1.05, browRaise: 0.3}},
    "Grinning Face with Big Eyes"    : {emoji: "😃", face: {...SMILEY_GRIN, teethTop: 0.6, tongue: 0.6, eyeScale: 1.3, browRaise: 0.5}},
    "Grinning Face with Smiling Eyes": {emoji: "😄", face: {...SMILEY_GRIN, teethTop: 0.6, tongue: 0.6, eyeArc: 1, eyeArcBend: 1, browRaise: 0.35}},
    "Beaming Face with Smiling Eyes" : {emoji: "😁", face: {...SMILEY_GRIN, mouthOpen: 0.95, mouthWidth: 1.3, teethTop: 1, teethBottom: 1, eyeArc: 1, eyeArcBend: 1.35, browRaise: 0.4}},
    "Smiling Face"                   : {emoji: "☺️", face: {mouthCurve: 0.6, mouthWidth: 0.95, blush: 0.7, browRaise: 0.15}},
    "Smiling Face with Smiling Eyes" : {emoji: "😊", face: {mouthCurve: 0.9, eyeArc: 1, eyeArcBend: 1, blush: 0.6, browRaise: 0.2}},
    "Face with Hand Over Mouth"      : {emoji: "🤭", face: {mouthCurve: 0.8, eyeArc: 1, eyeArcBend: 1, blush: 0.45, handMouth: 1, handDX: 24, handDY: 14, handTilt: -10, browRaise: 0.3}},

    // Love
    "Smiling Face with Hearts"    : {emoji: "🥰", face: {mouthCurve: 0.9, eyeArc: 1, eyeArcBend: 1, blush: 0.85, hearts: 1, tilt: -6, browRaise: 0.2}},
    "Smiling Face with Heart-Eyes": {emoji: "😍", face: {...SMILEY_GRIN, teethTop: 0.6, tongue: 0.5, heartEyes: 1, blush: 0.3, browRaise: 0.3}},

    // Sad
    "Crying Face"   : {emoji: "😢", face: {brows: 1, browAngle: 0.8, browRaise: 0.1, mouthCurve: -0.6, mouthWidth: 0.8, eyeOpen: 0.85, gazeY: 0.35, tear: 1}},
    "Pensive Face"  : {emoji: "😔", face: {brows: 1, browAngle: 0.7, browRaise: -0.1, eyeArc: 1, eyeArcBend: -1, mouthCurve: -0.45, mouthWidth: 0.7, turnY: 0.3}},
    "Frowning Face" : {emoji: "☹️", face: {mouthCurve: -0.8, mouthWidth: 0.9, gazeY: 0.2, browAngle: 0.5}},

    // Grumpy
    "Unamused Face"          : {emoji: "😒", face: {brows: 1, browAngle: -0.25, browRaise: -0.6, eyeOpen: 0.45, gazeX: 0.5, mouthCurve: -0.35, mouthWidth: 0.65}},
    "Face with Rolling Eyes" : {emoji: "🙄", face: {brows: 1, browRaise: 0.4, gazeX: 0.3, gazeY: -1, eyeOpen: 0.85, mouthCurve: -0.15, mouthWidth: 0.7}},

    // Scared (Anguished and Fearful are the same face, with and without the blue shading)
    "Anguished Face"  : {emoji: "😧", face: {eyeOval: SMILEY_EYE_CIRCLE, brows: 1, browAngle: 1, browRaise: 0.7, eyeScale: 1.25, mouthCurve: -0.6, mouthOpen: 0.5, mouthWidth: 0.6, scale: 0.96}},
    "Fearful Face"    : {emoji: "😨", face: {brows: 1, browAngle: 1, browRaise: 0.7, eyeScale: 1.25, mouthCurve: -0.6, mouthOpen: 0.5, mouthWidth: 0.6, scale: 0.94, fearShade: 1}},
    "Grimacing Face"  : {emoji: "😬", face: {eyeOval: SMILEY_EYE_CIRCLE, mouthCurve: -0.05, mouthOpen: 0.7, mouthWidth: 1.25, mouthSquare: 1, teethTop: 1, teethBottom: 1, teethGaps: 1, eyeScale: 1.1, browAngle: 0.5, browRaise: 0.4}},

    // Sick (the two spiral faces are the same face, with and without the green tint)
    "Face with Spiral Eyes"      : {emoji: "😵‍💫", face: {spiral: 1, mouthCurve: 0, mouthWave: 1, mouthWidth: 0.75, browAngle: 0.4}},
    "Sick Face with Spiral Eyes" : {emoji: "🤢", face: {spiral: 1, mouthCurve: 0, mouthWave: 1, mouthWidth: 0.75, browAngle: 0.4, faceRgb: [...SMILEY_SICK_RGB]}},
    "Cold Face"                  : {emoji: "🥶", face: {eyeOval: SMILEY_EYE_CIRCLE, mouthCurve: -0.15, mouthOpen: 0.65, mouthWidth: 1.1, mouthSquare: 1, teethTop: 1, teethBottom: 1, teethGaps: 1, brows: 1, browAngle: 0.7, browRaise: 0.3, frost: 0.7, icicles: 1, faceRgb: [...SMILEY_COLD_RGB], warmEdge: 0}},

    // Surprised
    "Face with Open Mouth"                   : {emoji: "😮", face: {eyeOval: SMILEY_EYE_CIRCLE, eyeScale: 1.2, mouthOpen: 0.75, mouthWidth: 0.45, mouthCircle: 1, mouthEyeFill: 1, browRaise: 0.6}},
    "Astonished Face"                        : {emoji: "😲", face: {brows: 1, browRaise: 1, browAngle: 0.2, eyeScale: 1.35, mouthCurve: -0.4, mouthOpen: 1.0, mouthWidth: 0.55}},
    "Face with Open Eyes and Hand Over Mouth": {emoji: "🫢", face: {eyeScale: 1.3, brows: 1, browRaise: 0.9, browAngle: 0.3, mouthCurve: -0.3, mouthOpen: 0.5, mouthWidth: 0.6, handMouth: 1, handDY: 2, handTilt: -5}},

    // Thinking (Ponder, with the hand on the chin, is an animation)
    "Face with Raised Eyebrow" : {emoji: "🤨", face: {brows: 1, browAsym: 0.9, browAngle: -0.2, eyeOpen: 0.85, mouthCurve: -0.1, mouthWidth: 0.6}},

    // Tired (Yawn is an animation)
    "Sleeping Face" : {emoji: "😴", face: {eyeArc: 1, eyeArcBend: -1, zzz: 1, mouthCurve: -0.1, mouthOpen: 0.3, mouthWidth: 0.32, tilt: -5, browRaise: -0.2}},

    // Angry (admin-only, like Buddy's)
    "Angry Face"     : {emoji: "😠", face: {brows: 1, browAngle: -1, browRaise: -0.6, eyeScale: 0.85, eyeInset: 6, mouthCurve: -0.7, mouthWidth: 0.8, faceRgb: [...SMILEY_ANGRY_RGB]}},
    "Red Angry Face" : {emoji: "😡", face: {brows: 1, browAngle: -1, browRaise: -0.7, eyeScale: 0.82, eyeInset: 7, mouthCurve: -0.8, mouthWidth: 0.7, faceRgb: [...SMILEY_POUT_RGB]}},
};

// Face the smiley dozes with (what Neutral means while it is asleep)
export const SMILEY_SLEEPING_FACE = fullFace(SMILEY_EXPRESSIONS["Sleeping Face"].face);

// Every named expression with its emoji, in catalog order (for building buttons and pickers)
export const SMILEY_EXPRESSION_LIST = Object.entries(SMILEY_EXPRESSIONS).map(([name, expression]: [string, Expression]) => ({name, emoji: expression.emoji}));

// Full face from the base face and an expression's (or animation's) changes to it
export function fullFace(changes: Partial<FaceState>): FaceState {
    return {...SMILEY_BASE_FACE, ...changes};
}

// Full face of an expression by name, ignoring case (null for any other name)
export function expressionFace(name: string): FaceState | null {
    const key = Object.keys(SMILEY_EXPRESSIONS).find((expression: string) => expression.toLowerCase() === name.toLowerCase());
    return (key === undefined) ? null : fullFace(SMILEY_EXPRESSIONS[key].face);
}


// --------------------------------------------------------------------------------
// Blending
// --------------------------------------------------------------------------------
// Move `t` of the way from one face to another (0 keeps `from`, 1 gives `to`)
export function blendFace(from: FaceState, to: FaceState, t: number): FaceState {
    const mix = (a: number, b: number): number => a + ((b - a) * t);

    // Blend the color per channel, then every number field (the clock comes from `to`)
    const face: FaceState = {...to, faceRgb: [mix(from.faceRgb[0], to.faceRgb[0]), mix(from.faceRgb[1], to.faceRgb[1]), mix(from.faceRgb[2], to.faceRgb[2])]};
    for (const key of FACE_NUMBER_KEYS) face[key] = mix(from[key], to[key]);
    return face;
}
