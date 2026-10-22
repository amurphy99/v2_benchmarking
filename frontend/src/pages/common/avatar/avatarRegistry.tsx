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

The optional handle methods are driven by the page, not the WebSocket. Each
avatar lists the ones it implements in `features`, and pages hide the controls
for the rest.

NOTE: The backend fills in `duration_ms: 3000` when an action has none, so every
      action in a live chat is currently timed. Holding is only reachable from
      the avatar demo page for now.

*/
import type { ReactElement, Ref } from "react";

// From this project
import   GltfRobotAvatar          from "./GltfRobotAvatar";
import   SmileyAvatar             from "./smiley/SmileyAvatar";
import { SMILEY_EXPRESSION_LIST } from "./smiley/faceState";


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

// Optional handle methods an avatar implements
export type AvatarFeature = "gaze" | "conversationState" | "speechLevel";

// Framing the page asks for (avatars that always fill their box ignore it)
export type AvatarZoom = "head" | "body";

// Methods every avatar exposes through its `ref`
export interface AvatarHandle {
    performAction         : (action: RobotAction) => void;        // Act out one backend action
    reset                 : () => void;                           // Return to Neutral now
    setGaze?              : (x: number, y: number) => void;       // Look toward a point (-1 to 1 each)
    clearGaze?            : () => void;                           // Go back to automatic gaze
    setConversationState? : (state: ConversationState) => void;   // React to the conversation
    setSpeechLevel?       : (level: number) => void;              // Voice loudness, 0 to 1
    setRestingExpression? : (value: string) => void;              // Face that "Neutral" means (one of `restingOptions`)
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

// Code-drawn face with expressions, gaze, and a speaking mouth (eyebrows only on the expressions that use them)
const SMILEY_AVATAR: AvatarEntry = {
    id             : "smiley",
    label          : "Smiley (2D)",
    features       : ["gaze", "conversationState", "speechLevel"],
    restingOptions : SMILEY_RESTING_OPTIONS,
    render         : (props: AvatarProps): ReactElement => <SmileyAvatar {...props} />,
};

// The same face with its eyebrows always showing
const SMILEY_BROWS_AVATAR: AvatarEntry = {
    id             : "smiley-brows",
    label          : "Smiley + eyebrows (2D)",
    features       : ["gaze", "conversationState", "speechLevel"],
    restingOptions : SMILEY_RESTING_OPTIONS,
    render         : (props: AvatarProps): ReactElement => <SmileyAvatar browsAlways {...props} />,
};

// Every avatar, in picker order
export const AVATARS: AvatarEntry[] = [SMILEY_AVATAR, SMILEY_BROWS_AVATAR, QT_AVATAR, BUDDY_AVATAR];

// Find an avatar by id (a model choice with no entry shows Buddy, the backend's default model)
export function getAvatarEntry(id: string): AvatarEntry {
    return AVATARS.find((entry: AvatarEntry) => entry.id === id.toLowerCase()) ?? BUDDY_AVATAR;
}
