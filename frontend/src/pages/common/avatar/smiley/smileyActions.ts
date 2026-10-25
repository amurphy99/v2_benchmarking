/* The smiley's public actions in three categories, and the lookup that plays an incoming one.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/smileyActions`

Every name in these categories is part of the smiley's public API:

  - Expressions (`faceState.ts`): faces that change the face's shapes
  - Movements (`faceMotions.ts`): head and eye motions that leave the face alone
  - Animations (`faceAnimations.ts`): a face combined with movement or breath

The lines are a guide rather than a hard rule (an expression may hold a still
pose, like a tilt or a look aside). Names are unique across the three
categories, and each mood lists names from any of them.

On the wire, `robot_action` frames still carry the protocol's two kinds
(`CLIENT_PROTOCOL.md` §3.1): the buttons send Expressions and moods as
"emotion", and Movements and Animations as "animation". The smiley plays
whatever the name is and ignores the kind, so a name works under either one.

*/
import type { FaceAnimation                         } from "./faceAnimations";
import      { animationFor, SMILEY_ANIMATION_LIST   } from "./faceAnimations";
import type { FaceMotion                            } from "./faceMotions";
import      { motionFor, SMILEY_MOVEMENT_NAMES      } from "./faceMotions";
import type { FaceState                             } from "./faceState";
import      { expressionFace, SMILEY_EXPRESSION_LIST } from "./faceState";

// Names each mood picks from at random (keys are the backend's mood labels, plus admin-only Angry;
// Neutral is not here because it means the resting face)
const SMILEY_MOODS: Record<string, string[]> = {
    Happy     : ["Grinning Face", "Grinning Face with Big Eyes", "Grinning Face with Smiling Eyes", "Beaming Face with Smiling Eyes", "Smiling Face", "Smiling Face with Smiling Eyes", "Face with Hand Over Mouth"],
    Love      : ["Smiling Face with Hearts", "Smiling Face with Heart-Eyes"],
    Sad       : ["Crying Face", "Pensive Face", "Frowning Face"],
    Grumpy    : ["Unamused Face", "Face with Rolling Eyes"],
    Scared    : ["Fearful Face", "Anguished Face", "Grimacing Face"],
    Sick      : ["Sick Face with Spiral Eyes", "Face with Spiral Eyes", "Cold Face"],
    Surprised : ["Face with Open Mouth", "Astonished Face", "Face with Open Eyes and Hand Over Mouth"],
    Thinking  : ["Ponder", "Face with Raised Eyebrow"],
    Tired     : ["Sleeping Face", "Yawn"],
    Angry     : ["Angry Face", "Red Angry Face"],
};


// --------------------------------------------------------------------------------
// Action Types
// --------------------------------------------------------------------------------
// The three categories, in button order
export type SmileyCategory = "Expressions" | "Movements" | "Animations";

// What an incoming name resolves to
export type SmileyAction =
    | {category: "Expressions"; face      : FaceState    }
    | {category: "Movements";   motion    : FaceMotion   }
    | {category: "Animations";  animation : FaceAnimation};

// One category's buttons, and the `robot_action` kind they send
type ActionSection = {
    category : SmileyCategory;
    kind     : "emotion" | "animation";
    actions  : {label: string; name: string}[];   // Button label (emoji and name), and the public name it sends
};


// ================================================================================
// Public Actions
// ================================================================================
// Every public action by category, labeled for buttons
export const SMILEY_ACTION_SECTIONS: ActionSection[] = [
    {category: "Expressions", kind: "emotion",   actions: SMILEY_EXPRESSION_LIST.map(({name, emoji}) => ({label: `${emoji} ${name}`, name}))},
    {category: "Movements",   kind: "animation", actions: SMILEY_MOVEMENT_NAMES .map((name: string)  => ({label: name,               name}))},
    {category: "Animations",  kind: "animation", actions: SMILEY_ANIMATION_LIST .map(({name, emoji}) => ({label: (emoji === null) ? name : `${emoji} ${name}`, name}))},
];

// A public name, or a mood (a random one of its names), ignoring case and kind (null for anything else)
export function resolveSmileyAction(label: string): SmileyAction | null {
    const mood = Object.keys(SMILEY_MOODS).find((key: string) => key.toLowerCase() === label.toLowerCase());
    const name = (mood === undefined) ? label : SMILEY_MOODS[mood][Math.floor(Math.random() * SMILEY_MOODS[mood].length)];

    // Each category in turn (names are unique across them)
    const face = expressionFace(name);
    if (face !== null) return {category: "Expressions", face};
    const motion = motionFor(name);
    if (motion !== undefined) return {category: "Movements", motion};
    const animation = animationFor(name);
    if (animation !== undefined) return {category: "Animations", animation};
    return null;
}
