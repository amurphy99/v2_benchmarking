/* Action buttons for an avatar or robot, in the sections of its capability profile.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/controlGroups/AvatarActionsGroup`

Used by the AdminChat control panel and the avatar demo page.

*/
import      { btnClass, groupDivStyle, buttonSectionHeader     } from "@/hooks/chat-listener/chat-controls/styles";
import type { ActionOption, ActionSection, CapabilityProfile } from "../../capabilities/profiles";

// ================================================================================
// Avatar (or Robot) action controls
// ================================================================================
// Emotion buttons carry shared backend mood labels (or, for frontends with their own face names,
// those names); animation buttons carry the monitored frontend's own literal action names. The
// sections and their titles come from its capability profile. See `pages/admin/FRONTEND_CAPABILITIES.md`.
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

            {/* Each section of the profile (an emotion button is mapped by the frontend; an animation is its own literal name) */}
            {capabilities.sections.filter((section: ActionSection) => section.options.length > 0).map((section: ActionSection, index: number) => (
                <div key={section.title}>
                    <div className={`${(index === 0) ? "mt-2" : "mt-3"} text-xs opacity-60`}>{section.title}</div>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                        {section.options.map((action: ActionOption) => {
                            const busy = (action.kind === "emotion") ? pending.robot_emotion : pending.robot_animation;
                            return (
                                <button
                                    key       = {`${action.kind}-${action.value}`}
                                    className = {btnClass(busy || !connected, "secondary")}
                                    disabled  = {busy || !connected}
                                    onClick   = {() => (action.kind === "emotion") ? onEmotion(action.value) : onAnimation(action.value)}
                                >
                                    {busy ? "Sending..." : action.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
