/* Shared avatar contract and the list of avatars the web app can show.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/avatarRegistry`

Every avatar receives backend `robot_action` frames through one method,
`performAction()`, in the shape the backend relays them (`CLIENT_PROTOCOL.md`
§3.1). How an avatar acts each one out is up to that avatar, but it should:

  - emotion with `duration_ms`: show it, then return to Neutral after that time
  - emotion without a duration: hold it until another emotion replaces it
  - emotion "Neutral": return to Neutral
  - animation: play it once at its natural length, then return to Neutral
  - a new action of the same kind replaces the previous one
  - an unknown value falls back to Neutral (labels match case-insensitively)
  - an unknown kind is ignored

The smiley matches an action by its name in its own three categories
(Expressions, Movements, Animations) whichever kind it came as
(`smiley/actions/smileyActions.ts`).

The optional handle methods are driven by the page, not the WebSocket. Each
avatar lists the ones it implements in `features`, and pages hide the controls
for the rest. `sleep` and `wake` let the chat page doze an avatar while the
chat is off: while asleep, Neutral means the sleeping face, so an emotion that
arrives still shows and the avatar then dozes off again. `setSpeechPhase` says
where the avatar is in its own reply (talking, pausing between sentences,
wrapping up, or just finishing), so it can look away and back like a speaker.
`prepareToSpeak` says a reply is about to be spoken (and, when the page knows,
how soon its voice will be heard), so the avatar can take a breath first; it
lets go once its conversation state turns "speaking".

NOTE: The backend fills in `duration_ms: 3000` when an action has none, so every
      action in a live chat is currently timed. Holding is only reachable from
      the avatar demo page for now.

*/
import type { ReactElement, Ref } from "react";

// From this project
import   GltfRobotAvatar          from "./GltfRobotAvatar";
import   SmileyAvatar             from "./smiley/SmileyAvatar";
import { SMILEY_EXPRESSION_LIST } from "./smiley/actions/faceExpressions";


// --------------------------------------------------------------------------------
// Avatar Contract
// --------------------------------------------------------------------------------
// One `robot_action` frame's data, as the backend relays it
export type RobotAction = {
    kind         : string;          // "emotion" or "animation" today; any other kind is ignored
    value        : string;          // Mood label, or the avatar's own animation name
    duration_ms? : number | null;   // How long an emotion is shown (missing or null holds it)
};

// What the conversation is doing, for avatars that react to it
export type ConversationState = "idle" | "listening" | "thinking" | "speaking";

// Where the avatar is in its own spoken reply ("none" when it isn't speaking)
export type SpeechPhase = "none" | "talking" | "pausing" | "wrapping-up" | "finishing";

// Optional handle methods an avatar implements
export type AvatarFeature = "gaze" | "conversationState" | "speechLevel" | "speechGaze" | "sleep" | "mapTask";

// How an avatar holding a Map Task map behaves (each setting can change between test conditions)
export type MapTaskConfig = {
    raiseWhen     : "thinking" | "cue";   // Raise the map on its own as it starts thinking, or only on a cue
    listenGlances : boolean;              // Glance down at the map now and then while listening
    eyesOnMap     : boolean;              // Scan, lock on, and trace on the map (off: it looks at the map's middle)
};

// What to do with the map (snake_case, so a cue can go over the wire unchanged)
export type MapCue =
    | {cue: "raise"}    // Raise it to search
    | {cue: "lower"};   // Lower it and look back at the user

// Framing the page asks for (avatars that always fill their box ignore it)
export type AvatarZoom = "head" | "body";

// Methods every avatar exposes through its `ref`
export interface AvatarHandle {
    performAction          : (action: RobotAction          ) => void;       // Act out one backend action
    reset                  : (                             ) => void;       // Return to Neutral now
    setGaze              ? : (x: number, y: number         ) => void;       // Look toward a point (-1 to 1 each)
    clearGaze            ? : (                             ) => void;       // Go back to automatic gaze
    setConversationState ? : (state: ConversationState     ) => void;       // React to the conversation
    setSpeechLevel       ? : (level: number                ) => void;       // Voice loudness, 0 to 1
    setSpeechPhase       ? : (phase: SpeechPhase           ) => void;       // Where it is in its own reply (for where it looks)
    setRestingExpression ? : (value: string                ) => void;       // Face that "Neutral" means (one of `restingOptions`)
    sleep                ? : (                             ) => void;       // Doze until woken (Neutral means the sleeping face meanwhile)
    wake                 ? : (                             ) => void;       // Wake up and rest on the usual face again (does nothing when awake)
    prepareToSpeak       ? : (inMs?:  number               ) => void;       // A reply's voice is coming in `inMs` (unknown: the avatar's own estimate)
    setMapTask           ? : (config: MapTaskConfig | null ) => void;       // Hold a Map Task map with these settings (null puts it away)
    mapCue               ? : (cue:    MapCue               ) => void;       // Do something with the map it holds
}

// One face an avatar can rest on: the name shown in the picker, and the value its handle takes
export type RestingOption = {label: string; value: string};

// Props every avatar component accepts
export type AvatarProps = {
    ref? : Ref<AvatarHandle>;   // Handle the page drives the avatar through
    zoom : AvatarZoom;          // Framing the page asks for
};

// One avatar the web app can show
export type AvatarEntry = {
    id             : string;                                 // `UserSettings.modelChoice` value
    label          : string;                                 // Name shown in avatar pickers
    features       : AvatarFeature[];                        // Optional handle methods it implements
    restingOptions : RestingOption[];                        // Faces it can rest on, default first (empty without `setRestingExpression`)
    render         : (props: AvatarProps) => ReactElement;   // Builds the avatar element
};


// ================================================================================
// Avatars
// ================================================================================
// Clip-based 3D models of the two physical robots
const QT_AVATAR    : AvatarEntry = {id: "qt",    label: "QT Robot (3D)",    features: [], restingOptions: [], render: (props: AvatarProps): ReactElement => <GltfRobotAvatar model="qt"    {...props} />};
const BUDDY_AVATAR : AvatarEntry = {id: "buddy", label: "Buddy Robot (3D)", features: [], restingOptions: [], render: (props: AvatarProps): ReactElement => <GltfRobotAvatar model="buddy" {...props} />};

// Any named smiley expression can be its resting face (the catalog lists the default first)
const SMILEY_RESTING_OPTIONS: RestingOption[] = SMILEY_EXPRESSION_LIST.map(({name, emoji}) => ({label: `${emoji} ${name}`, value: name}));

// Code-drawn face with expressions, gaze, a speaking mouth, and sleep (eyebrows only on the expressions that use them)
const SMILEY_AVATAR: AvatarEntry = {
    id             : "smiley",
    label          : "Smiley (2D)",
    features       : ["gaze", "conversationState", "speechLevel", "speechGaze", "sleep", "mapTask"],
    restingOptions : SMILEY_RESTING_OPTIONS,
    render         : (props: AvatarProps): ReactElement => <SmileyAvatar {...props} />,
};

// The same face with its eyebrows always showing
const SMILEY_BROWS_AVATAR: AvatarEntry = {
    id             : "smiley-brows",
    label          : "Smiley + eyebrows (2D)",
    features       : ["gaze", "conversationState", "speechLevel", "speechGaze", "sleep", "mapTask"],
    restingOptions : SMILEY_RESTING_OPTIONS,
    render         : (props: AvatarProps): ReactElement => <SmileyAvatar browsAlways {...props} />,
};

// Every avatar, in picker order
export const AVATARS: AvatarEntry[] = [SMILEY_AVATAR, SMILEY_BROWS_AVATAR, QT_AVATAR, BUDDY_AVATAR];

// Find an avatar by id (a model choice with no entry shows Smiley, the backend's default model)
export function getAvatarEntry(id: string): AvatarEntry {
    return AVATARS.find((entry: AvatarEntry) => entry.id === id.toLowerCase()) ?? SMILEY_AVATAR;
}

// Whether a model choice has an avatar built yet (pickers hide reserved choices such as `temp1` until it does)
export function hasAvatarEntry(id: string): boolean {
    return AVATARS.some((entry: AvatarEntry) => entry.id === id);
}
