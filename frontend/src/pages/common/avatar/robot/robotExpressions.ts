/* The robot's own versions of the smiley's expressions.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/robot/robotExpressions`

The robot plays the smiley's expressions by name
(`smiley/actions/faceExpressions.ts`), and most of them fit its screen as
written. The ones here are reshaped for it: each entry lists the fields the
robot changes, laid over that expression's own, so anything not listed stays as
the smiley has it. An expression with no entry is drawn as the smiley's.

What the changes are for:

  - Its mouth is small and drawn in light, so smiles curve more, grins are a
    plain half-moon with a tongue (no upper teeth), and frowns are a little
    wider.
  - Its brows are thin, so sad, scared, and angry faces also slant the eyelids
    (`lidAngle`), which cuts the look into the eyes themselves.
  - Its cheeks are lights, so the warm faces turn them up further.

`RobotAvatar` hands these to the face controller. The sizes every expression is
drawn at are in `ROBOT_FACE_LAYOUT` (`render_2d/robotDrawing2D.ts`).

*/
import type { FaceVariants } from "@/pages/common/avatar/smiley/actions/faceExpressions";
import type { FaceChanges  } from "@/pages/common/avatar/smiley/state/faceState";

// Grin shared by the open-mouthed smiling faces: a wide half-moon just under the eye line, with a tongue and no teeth
const ROBOT_GRIN: FaceChanges = {mouthCurve: 0.5, mouthOpen: 1, mouthWidth: 1.3, mouthTopBow: 0, mouthShift: -6, teethTop: 0, tongue: 0.9};

// Every expression the robot reshapes, keyed by the expression's name
export const ROBOT_FACE_VARIANTS: FaceVariants = {
    // Calm
    "Slightly Smiling Face" : {mouthCurve: 0.5},

    // Happy
    "Grinning Face"                   : {...ROBOT_GRIN, blush: 0.4},
    "Grinning Face with Big Eyes"     : {...ROBOT_GRIN, blush: 0.4, eyeScale: 1.2},
    "Grinning Face with Smiling Eyes" : {...ROBOT_GRIN, blush: 0.5},
    "Beaming Face with Smiling Eyes"  : {mouthCurve: 0.5, mouthOpen: 0.62, mouthWidth: 1.5, mouthTopBow: 0, mouthShift: -4, blush: 0.5},
    "Smiling Face"                    : {mouthCurve: 0.8, mouthWidth: 1.15, blush: 0.8},
    "Smiling Face with Smiling Eyes"  : {mouthCurve: 1, mouthWidth: 1.25, blush: 0.9},

    // Love
    "Smiling Face with Hearts"     : {mouthCurve: 1, mouthWidth: 1.25, blush: 1},
    "Smiling Face with Heart-Eyes" : {mouthCurve: 0.5, mouthOpen: 0.6, mouthWidth: 1.2, mouthTopBow: 0, mouthShift: 0, teethTop: 0, tongue: 0.9, blush: 1},

    // Sad
    "Crying Face"   : {lidAngle: 0.5, mouthCurve: -0.7, mouthWidth: 0.9},
    "Pensive Face"  : {mouthCurve: -0.5, mouthWidth: 0.8},
    "Frowning Face" : {lidAngle: 0.35, mouthCurve: -0.9, mouthWidth: 1},

    // Grumpy
    "Unamused Face" : {lidAngle: -0.25, mouthCurve: -0.4, mouthWidth: 0.8, mouthSide: 6},

    // Scared
    "Anguished Face" : {lidAngle: 0.3, mouthWidth: 0.7},
    "Fearful Face"   : {lidAngle: 0.3, mouthWidth: 0.7},

    // Sick
    "Cold Face" : {mouthWidth: 1.25},

    // Surprised
    "Wide-Eyed" : {mouthCurve: 0, mouthWidth: 0.5, blush: 0.6},

    // Angry
    "Angry Face"     : {lidAngle: -0.55, mouthCurve: -0.8, mouthWidth: 0.9},
    "Red Angry Face" : {lidAngle: -0.75, mouthCurve: -0.9, mouthWidth: 0.85},
};
