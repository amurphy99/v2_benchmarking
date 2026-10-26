/* The smiley's Expressions: named faces that change the face's shapes.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/actions/faceExpressions`

An expression is a set of face field values (changes to the base face in
`state/faceState.ts`), so a new one is a combination of the existing shapes and
extras: one line in `SMILEY_EXPRESSIONS`. Expressions are named after the iOS
emoji they borrow from. They are the "Expressions" category of the smiley's
public actions. Faces combined with movement or breath (Ponder, Yawn) are
animations (`faceAnimations.ts`), and the moods and the lookup that matches an
incoming action's name to any category are in `smileyActions.ts`.

"Neutral" is not a fixed face: it is whichever expression the controller is
resting on (`Slightly Smiling Face` unless the page picks another).

Every expression sets a brow pose even when it keeps the brows hidden, so the
"Smiley + eyebrows" avatar (which always shows them) still gets a fitting brow.

*/
import type { FaceChanges, FaceState } from "../state/faceState";
import      { fullFace               } from "../state/faceState";

// Face fill colors, 0-255 per channel (the default yellow is the base face's, in `state/faceState.ts`)
const SMILEY_SICK_RGB  = [196, 222, 110] as const;   // Light green, for the sick spiral face
const SMILEY_ANGRY_RGB = [255, 160,  60] as const;   // Orange, for the angry face
const SMILEY_POUT_RGB  = [240, 100,  75] as const;   // Red, for the red angry face
const SMILEY_COLD_RGB  = [110, 190, 245] as const;   // Blue, for the cold face

// Open-eye shapes for `eyeOval` besides the base face's default oval: how much taller than wide an eye is (the eye keeps its area)
const SMILEY_EYE_CIRCLE      = 0;
const SMILEY_EYE_SLIGHT_OVAL = 0.25;
const SMILEY_EYE_TALL_OVAL   = 0.85;

// Grin shared by the open-mouthed smiling faces: a large half circle with a gently bowed top, set high
const SMILEY_GRIN: FaceChanges = {mouthCurve: 0.35, mouthOpen: 1.1, mouthWidth: 1.12, mouthFlatTop: 1, mouthTopBow: 4, mouthShift: -14};

// Expression the face rests on until the page picks another
export const SMILEY_DEFAULT_RESTING_EXPRESSION = "Slightly Smiling Face";

// One named expression: the emoji it borrows from, and how it differs from the base face
type Expression = {emoji: string; face: FaceChanges};


// ================================================================================
// Expressions
// ================================================================================
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
    "Face with Hand Over Mouth"      : {emoji: "🤭", face: {mouthCurve: 0.8, eyeArc: 1, eyeArcBend: 1, blush: 0.45, browRaise: 0.3, objects: [{kind: "hand", side: "left", shape: "raised", at: "mouth", dx: 24, dy: 14, angle: -40}]}},

    // Love
    "Smiling Face with Hearts"    : {emoji: "🥰", face: {mouthCurve: 0.9, eyeArc: 1, eyeArcBend: 1, blush: 0.85, tilt: -6, browRaise: 0.2, objects: [
        {kind: "heart", at: "center", dx: -96, dy: -50, scale: 1, bob: 4, pulse: 0.12},
        {kind: "heart", at: "center", dx:  94, dy: -68, scale: 1, bob: 4, pulse: 0.12},
        {kind: "heart", at: "center", dx:  98, dy:  40, scale: 1, bob: 4, pulse: 0.12},
    ]}},
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
    "Face with Open Eyes and Hand Over Mouth": {emoji: "🫢", face: {eyeScale: 1.3, brows: 1, browRaise: 0.9, browAngle: 0.3, mouthCurve: -0.3, mouthOpen: 0.5, mouthWidth: 0.6, objects: [{kind: "hand", side: "left", shape: "raised", at: "mouth", dy: 2, angle: -35}]}},

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

// Full face of an expression by name, ignoring case (null for any other name)
export function expressionFace(name: string): FaceState | null {
    const key = Object.keys(SMILEY_EXPRESSIONS).find((expression: string) => expression.toLowerCase() === name.toLowerCase());
    return (key === undefined) ? null : fullFace(SMILEY_EXPRESSIONS[key].face);
}
