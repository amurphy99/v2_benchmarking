/* Per-frontend action capability profiles for the AdminChat control panel.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/capabilities/profiles`

The backend sends every interface the same `robot_action` vocabulary and does
not know what any given frontend can actually do. This registry is the admin
page's side of that contract: it decides which action buttons to show for the
chat being monitored, based on the `source` (and, for the webapp, the
`avatarModel`) reported in the `session_info` frame.

Emotion buttons use the shared backend mood vocabulary, with confirmed client-
specific extensions such as Buddy's admin-only "Angry". Animation buttons are
different: they carry the frontend's own literal clip or behavior names.

See `../FRONTEND_CAPABILITIES.md` for how to add a profile for a new robot.

*/
import { buddyAnimations, qtAnimations } from "@/pages/common/avatar/AvatarUtils";
import { SMILEY_ANIMATIONS             } from "@/pages/common/avatar/smiley/faceMotions";

// --------------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------------
// One button: what the admin reads, and the {kind, value} relayed to the frontend
export type ActionOption = {
    label : string;                      // Shown on the button (the frontend's own name for it)
    kind  : "emotion" | "animation";     // Matches the backend's ROBOT_ACTION_KINDS
    value : string;                      // Sent verbatim; the frontend maps it however it likes
};

export type CapabilityProfile = {
    name       : string;          // Human-readable, shown in the panel header
    emotions   : ActionOption[];  // Mapped through the frontend's own emotion vocabulary
    animations : ActionOption[];  // Literal clip/behavior names, driven directly
};

// --------------------------------------------------------------------------------
// The LLM's emotion vocabulary (backend `ResponseMood`, cognibot_api.py)
// --------------------------------------------------------------------------------
// Safe protocol floor for an interface we have not profiled yet: these are the values
// the LLM already sends unprompted. A compliant client maps the moods it supports and
// falls back to a neutral/idle behavior for the rest.
export const LLM_MOODS = [
    "Neutral", "Grumpy", "Happy", "Love", "Sad",
    "Scared", "Sick", "Surprised", "Thinking", "Tired",
] as const;

const asEmotions   = (labels: readonly string[]): ActionOption[] =>
    labels.map((label) => ({ label, kind: "emotion", value: label }));

const asAnimations = (labels: readonly string[]): ActionOption[] =>
    labels.map((label) => ({ label, kind: "animation", value: label }));

// --------------------------------------------------------------------------------
// Profiles
// --------------------------------------------------------------------------------
// Fallback for any source without a specific profile (currently qtrobot)
const DEFAULT_PROFILE: CapabilityProfile = {
    name       : "Generic",
    emotions   : asEmotions(LLM_MOODS),
    animations : [],
};

// Webapp avatars offer both abstract mood controls and direct animation names. Which model is
// showing is a per-user setting, which is why `avatarModel` has to come through session_info
// -- `source: "webapp"` is not enough to select the literal animation names. The avatar demo
// page reads these same profiles, keyed by the ids in `common/avatar/avatarRegistry`.
const WEBAPP_PROFILES: Record<string, CapabilityProfile> = {
    qt: {
        name       : "Web Avatar (QT)",
        emotions   : asEmotions(LLM_MOODS),
        animations : asAnimations(Object.keys(qtAnimations)),
    },
    buddy: {
        name       : "Web Avatar (Buddy)",
        emotions   : asEmotions(LLM_MOODS),
        animations : asAnimations(Object.keys(buddyAnimations)),
    },
    // Code-drawn face: has its own Angry face (admin-only, like Buddy's) and named head motions
    smiley: {
        name       : "Web Avatar (Smiley)",
        emotions   : asEmotions([...LLM_MOODS, "Angry"]),
        animations : asAnimations(SMILEY_ANIMATIONS),
    },
};

// Physical Buddy robot: has dedicated "Angry" and "Love" faces that look much better than the
// generic mapping, and Angry is one we specifically do not want the LLM choosing on its own.
// TODO: Fill in Buddy's real animation/behavior names once they are confirmed on the robot.
const BUDDYROBOT_PROFILE: CapabilityProfile = {
    name       : "Buddy Robot",
    emotions   : asEmotions([...LLM_MOODS, "Angry"]),
    animations : [],
};

// --------------------------------------------------------------------------------
// Resolve a profile for the chat being monitored
// --------------------------------------------------------------------------------
export function getCapabilityProfile(source?: string | null, avatarModel?: string | null): CapabilityProfile {
    if (source === "webapp") return WEBAPP_PROFILES[(avatarModel ?? "").toLowerCase()] ?? DEFAULT_PROFILE;
    if (source === "buddyrobot") return BUDDYROBOT_PROFILE;

    // qtrobot and anything new fall back until they get a profile of their own
    return DEFAULT_PROFILE;
}
