/* Emotion, animation, and mood buttons for an avatar or robot, from its capability profile.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/controlGroups/AvatarActionsGroup`

Used by the AdminChat control panel and the avatar demo page.

*/
import { btnClass, groupDivStyle, buttonSectionHeader } from "@/hooks/chat-listener/chat-controls/styles";
import type { CapabilityProfile } from "../../capabilities/profiles";

// ================================================================================
// Avatar (or Robot) action controls
// ================================================================================
// Emotion buttons carry shared backend mood labels (or, for frontends with their own face names,
// those names); animation buttons carry the monitored frontend's own literal action names; mood
// buttons, when a profile lists them apart, send the LLM's moods. All come from its capability
// profile. See `pages/admin/FRONTEND_CAPABILITIES.md`.
export default function AvatarActionsGroup({
    connected,    // Connection with the backend
    capabilities, // Actions the monitored frontend can actually perform
    pending,      // Actions that can be pending (waiting for backend acks)
    // Methods to call for each action in this control group
    onEmotion,    // Tell the robot to display an emotion
    onAnimation,  // Tell the robot to play a named animation
}: {
    connected    : boolean;
    capabilities : CapabilityProfile;
    pending      : {
        robot_emotion    : boolean;
        robot_animation  : boolean;
    };
    onEmotion   : (emotion  : string) => void;
    onAnimation : (animation: string) => void;
}) {
    // ================================================================================
    // UI Component Group
    // ================================================================================
    return (
        <div className={groupDivStyle}>
            {/* Header (names the profile so it is obvious which interface these map to) */}
            <div className="flex items-center justify-between">
                <div className={buttonSectionHeader}>Avatar Actions</div>
                <div className="text-xs opacity-60">{capabilities.name}</div>
            </div>

            {/* Abstract emotions, mapped onto concrete behavior by the client */}
            <div className="mt-2 text-xs opacity-60">Emotions</div>
            <div className="mt-1 grid grid-cols-2 gap-2">
                {capabilities.emotions.map((action) => (
                    <button
                        key       = {`emotion-${action.value}`}
                        className = {btnClass(pending.robot_emotion || !connected, "secondary")}
                        disabled  = {pending.robot_emotion || !connected}
                        onClick   = {() => onEmotion(action.value)}
                    >
                        {pending.robot_emotion ? "Sending..." : action.label}
                    </button>
                ))}
            </div>

            {/* Animations (only shown for frontends whose clip names we know) */}
            {capabilities.animations.length > 0 && (
                <>
                    <div className="mt-3 text-xs opacity-60">Animations</div>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                        {capabilities.animations.map((action) => (
                            <button
                                key       = {`animation-${action.value}`}
                                className = {btnClass(pending.robot_animation || !connected, "secondary")}
                                disabled  = {pending.robot_animation || !connected}
                                onClick   = {() => onAnimation(action.value)}
                            >
                                {pending.robot_animation ? "Sending..." : action.label}
                            </button>
                        ))}
                    </div>
                </>
            )}

            {/* LLM moods (only for frontends whose emotion buttons are their own face names) */}
            {capabilities.moods.length > 0 && (
                <>
                    <div className="mt-3 text-xs opacity-60">Moods (what the LLM sends; shows a matching face)</div>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                        {capabilities.moods.map((action) => (
                            <button
                                key       = {`mood-${action.value}`}
                                className = {btnClass(pending.robot_emotion || !connected, "secondary")}
                                disabled  = {pending.robot_emotion || !connected}
                                onClick   = {() => onEmotion(action.value)}
                            >
                                {pending.robot_emotion ? "Sending..." : action.label}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
