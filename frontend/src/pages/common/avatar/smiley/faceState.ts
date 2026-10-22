/* Face state for the smiley avatar: the numbers a renderer draws, and the expression catalog.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/faceState`

The controller (`useFaceController`) moves these numbers over time, and a
renderer (`SmileyFace2D`, later a 3D one) only draws them, so a new renderer
reuses every expression and behavior unchanged. Every field is a number (or an
RGB triple) so any two faces can be blended. Eye styles (closed arcs, spirals,
hearts) are crossfade amounts for the same reason.

Expressions are named after the iOS emoji they borrow from. Each backend mood
maps to a few of them, and `expressionFor` picks one at random so a live chat
does not show the same face every time. An admin (or the demo page) can also
send an expression's own name as an emotion to show that exact face.

Every expression sets a brow pose even when it keeps the brows hidden, so the
"Smiley + eyebrows" avatar (which always shows them) still gets a fitting brow.

*/
// Face fill colors, 0-255 per channel
const SMILEY_YELLOW_RGB = [255, 206,  64] as const;   // Default face
const SMILEY_SICK_RGB   = [196, 222, 110] as const;   // Light green, for the sick spiral face
const SMILEY_ANGRY_RGB  = [255, 160,  60] as const;   // Orange, for the angry face
const SMILEY_POUT_RGB   = [240, 100,  75] as const;   // Red, for the pouting face


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
    eyeOpen    : number;   // 0 (closed) to 1 (open)
    eyeScale   : number;   // Eye size multiplier
    lidAngle   : number;   // Eyelid slant, -1 (angry) to 1 (worried)
    eyeArc     : number;   // Closed-eye arcs in place of the open eyes, 0 to 1
    eyeArcBend : number;   // Arc shape, 1 (smiling ^ ^) to -1 (sleeping)
    spiral     : number;   // Dizzy spiral eyes in place of the open eyes, 0 to 1
    heartEyes  : number;   // Heart-shaped eyes in place of the open eyes, 0 to 1

    // Eyebrows
    brows     : number;   // Visibility, 0 (hidden) to 1
    browRaise : number;   // Both brows, -1 (lowered) to 1 (raised)
    browAngle : number;   // Slant, -1 (angry, inner ends down) to 1 (worried, inner ends up)
    browAsym  : number;   // One brow up and the other down, -1 (left up) to 1 (right up)

    // Mouth
    mouthCurve : number;   // -1 (frown) to 1 (smile)
    mouthOpen  : number;   // 0 (closed) to 1 (wide open)
    mouthWidth : number;   // Width multiplier
    mouthWave  : number;   // Wavy mouth line, 0 to 1

    // Extras
    tear      : number;   // Tear drop running down one cheek, 0 to 1
    fearShade : number;   // Blue shading over the top of the face, 0 to 1
    zzz       : number;   // Floating sleep Zs, 0 to 1
    hearts    : number;   // Small hearts floating around the head, 0 to 1

    // Color and size
    blush   : number;   // Cheek blush, 0 to 1
    faceRgb : RGB;      // Face fill color
    scale   : number;   // Whole-face size multiplier
    offsetX : number;   // Sideways shift in face radii (positive is right)
    offsetY : number;   // Vertical shift in face radii (negative is up)

    // Controller clock in seconds (drives the tear, Zs, hearts, and spiral spin; never blended)
    timeSec : number;
};

// Number fields that blend (everything but the color and the clock)
type FaceNumberKey = Exclude<keyof FaceState, "faceRgb" | "timeSec">;
const FACE_NUMBER_KEYS: FaceNumberKey[] = [
    "gazeX", "gazeY", "turnX", "turnY", "tilt",
    "eyeOpen", "eyeScale", "lidAngle", "eyeArc", "eyeArcBend", "spiral", "heartEyes",
    "brows", "browRaise", "browAngle", "browAsym",
    "mouthCurve", "mouthOpen", "mouthWidth", "mouthWave",
    "tear", "fearShade", "zzz", "hearts",
    "blush", "scale", "offsetX", "offsetY",
];

// One named expression: the emoji it borrows from, and how it differs from Neutral
type Expression = {emoji: string; face: Partial<FaceState>};


// ================================================================================
// Expressions
// ================================================================================
// Resting face: open eyes, a mild smile, and relaxed (hidden) brows
export const SMILEY_NEUTRAL_FACE: FaceState = {
    gazeX      : 0,
    gazeY      : 0,
    turnX      : 0,
    turnY      : 0,
    tilt       : 0,
    eyeOpen    : 1,
    eyeScale   : 1,
    lidAngle   : 0,
    eyeArc     : 0,
    eyeArcBend : 1,
    spiral     : 0,
    heartEyes  : 0,
    brows      : 0,
    browRaise  : 0,
    browAngle  : 0,
    browAsym   : 0,
    mouthCurve : 0.35,
    mouthOpen  : 0,
    mouthWidth : 1,
    mouthWave  : 0,
    tear       : 0,
    fearShade  : 0,
    zzz        : 0,
    hearts     : 0,
    blush      : 0,
    faceRgb    : [...SMILEY_YELLOW_RGB],
    scale      : 1,
    offsetX    : 0,
    offsetY    : 0,
    timeSec    : 0,
};

// Every named expression (names follow iOS emoji names)
const SMILEY_EXPRESSIONS: Record<string, Expression> = {
    // Neutral
    "Slightly Smiling Face" : {emoji: "🙂", face: {}},
    "Neutral Face"          : {emoji: "😐", face: {mouthCurve: 0, mouthWidth: 0.8}},

    // Happy
    "Grinning Face"                  : {emoji: "😀", face: {mouthCurve: 1.0, mouthOpen: 0.4, mouthWidth: 1.05, eyeScale: 1.05, blush: 0.15, browRaise: 0.3}},
    "Grinning Face with Smiling Eyes": {emoji: "😄", face: {mouthCurve: 1.0, mouthOpen: 0.45, mouthWidth: 1.05, eyeArc: 1, eyeArcBend: 1, blush: 0.25, browRaise: 0.35}},
    "Smiling Face with Smiling Eyes" : {emoji: "😊", face: {mouthCurve: 0.9, eyeArc: 1, eyeArcBend: 1, blush: 0.6, browRaise: 0.2}},

    // Love
    "Smiling Face with Hearts"    : {emoji: "🥰", face: {mouthCurve: 0.9, eyeArc: 1, eyeArcBend: 1, blush: 0.85, hearts: 1, tilt: -6, browRaise: 0.2}},
    "Smiling Face with Heart-Eyes": {emoji: "😍", face: {mouthCurve: 1.0, mouthOpen: 0.45, heartEyes: 1, blush: 0.3, browRaise: 0.3}},

    // Sad
    "Crying Face"   : {emoji: "😢", face: {brows: 1, browAngle: 0.8, browRaise: 0.1, mouthCurve: -0.6, mouthWidth: 0.8, eyeOpen: 0.85, gazeY: 0.35, tear: 1}},
    "Pensive Face"  : {emoji: "😔", face: {brows: 1, browAngle: 0.7, browRaise: -0.1, eyeArc: 1, eyeArcBend: -1, mouthCurve: -0.45, mouthWidth: 0.7, turnY: 0.3}},
    "Frowning Face" : {emoji: "☹️", face: {mouthCurve: -0.8, mouthWidth: 0.9, gazeY: 0.2, browAngle: 0.5}},

    // Grumpy
    "Unamused Face"          : {emoji: "😒", face: {brows: 1, browAngle: -0.25, browRaise: -0.6, eyeOpen: 0.45, gazeX: 0.5, mouthCurve: -0.35, mouthWidth: 0.65}},
    "Face with Rolling Eyes" : {emoji: "🙄", face: {brows: 1, browRaise: 0.4, gazeX: 0.3, gazeY: -1, eyeOpen: 0.85, mouthCurve: -0.15, mouthWidth: 0.7}},

    // Scared (the same face, with and without the blue shading)
    "Anguished Face" : {emoji: "😧", face: {brows: 1, browAngle: 1, browRaise: 0.7, eyeScale: 1.25, mouthCurve: -0.6, mouthOpen: 0.5, mouthWidth: 0.6, scale: 0.96}},
    "Fearful Face"   : {emoji: "😨", face: {brows: 1, browAngle: 1, browRaise: 0.7, eyeScale: 1.25, mouthCurve: -0.6, mouthOpen: 0.5, mouthWidth: 0.6, scale: 0.94, fearShade: 1}},

    // Sick (the same face, with and without the green tint)
    "Face with Spiral Eyes"      : {emoji: "😵‍💫", face: {spiral: 1, mouthCurve: 0, mouthWave: 1, mouthWidth: 0.75, browAngle: 0.4}},
    "Sick Face with Spiral Eyes" : {emoji: "🤢", face: {spiral: 1, mouthCurve: 0, mouthWave: 1, mouthWidth: 0.75, browAngle: 0.4, faceRgb: [...SMILEY_SICK_RGB]}},

    // Surprised
    "Face with Open Mouth" : {emoji: "😮", face: {eyeScale: 1.2, mouthCurve: -0.35, mouthOpen: 0.75, mouthWidth: 0.45, browRaise: 0.6}},
    "Astonished Face"      : {emoji: "😲", face: {brows: 1, browRaise: 1, browAngle: 0.2, eyeScale: 1.35, mouthCurve: -0.4, mouthOpen: 1.0, mouthWidth: 0.55}},

    // Thinking
    "Thinking Face"            : {emoji: "🤔", face: {brows: 1, browAsym: 0.8, browAngle: -0.1, mouthCurve: 0.05, mouthWidth: 0.55, gazeX: -0.6, gazeY: -0.6, tilt: 8}},
    "Face with Raised Eyebrow" : {emoji: "🤨", face: {brows: 1, browAsym: 0.9, browAngle: -0.2, eyeOpen: 0.85, mouthCurve: -0.1, mouthWidth: 0.6}},

    // Tired
    "Sleeping Face" : {emoji: "😴", face: {eyeArc: 1, eyeArcBend: -1, zzz: 1, mouthCurve: -0.1, mouthOpen: 0.3, mouthWidth: 0.32, tilt: -5, browRaise: -0.2}},
    "Yawning Face"  : {emoji: "🥱", face: {eyeArc: 1, eyeArcBend: -1, mouthCurve: -0.4, mouthOpen: 1.0, mouthWidth: 0.55, tilt: -4, browRaise: 0.3, browAngle: 0.3}},

    // Angry (admin-only, like Buddy's)
    "Angry Face"   : {emoji: "😠", face: {brows: 1, browAngle: -1, browRaise: -0.4, lidAngle: -0.5, eyeOpen: 0.75, mouthCurve: -0.7, mouthWidth: 0.8, faceRgb: [...SMILEY_ANGRY_RGB]}},
    "Pouting Face" : {emoji: "😡", face: {brows: 1, browAngle: -1, browRaise: -0.5, lidAngle: -0.6, eyeOpen: 0.7, mouthCurve: -0.8, mouthWidth: 0.7, faceRgb: [...SMILEY_POUT_RGB]}},
};

// Expressions each mood picks from at random (keys are the backend's mood labels, plus admin-only Angry)
const SMILEY_MOOD_EXPRESSIONS: Record<string, string[]> = {
    Neutral   : ["Slightly Smiling Face"],
    Happy     : ["Grinning Face", "Grinning Face with Smiling Eyes", "Smiling Face with Smiling Eyes"],
    Love      : ["Smiling Face with Hearts", "Smiling Face with Heart-Eyes"],
    Sad       : ["Crying Face", "Pensive Face", "Frowning Face"],
    Grumpy    : ["Unamused Face", "Face with Rolling Eyes"],
    Scared    : ["Fearful Face", "Anguished Face"],
    Sick      : ["Sick Face with Spiral Eyes", "Face with Spiral Eyes"],
    Surprised : ["Face with Open Mouth", "Astonished Face"],
    Thinking  : ["Thinking Face", "Face with Raised Eyebrow"],
    Tired     : ["Sleeping Face", "Yawning Face"],
    Angry     : ["Angry Face", "Pouting Face"],
};

// Every named expression with its emoji, in catalog order (for building buttons)
export const SMILEY_EXPRESSION_LIST = Object.entries(SMILEY_EXPRESSIONS).map(([name, expression]: [string, Expression]) => ({name, emoji: expression.emoji}));

// Full face for a mood (a random one of its expressions) or an expression name, ignoring case
// (unknown labels show Neutral)
export function expressionFor(label: string): FaceState {
    const matches = (key: string): boolean => key.toLowerCase() === label.toLowerCase();

    // A mood picks one of its expressions; an expression name picks itself
    const mood    = Object.keys(SMILEY_MOOD_EXPRESSIONS).find(matches);
    const choices = (mood === undefined) ? Object.keys(SMILEY_EXPRESSIONS).filter(matches) : SMILEY_MOOD_EXPRESSIONS[mood];
    if (choices.length === 0) return SMILEY_NEUTRAL_FACE;

    const name = choices[Math.floor(Math.random() * choices.length)];
    return {...SMILEY_NEUTRAL_FACE, ...SMILEY_EXPRESSIONS[name].face};
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
