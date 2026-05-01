
import { btnClass, groupDivStyle, buttonSectionHeader } from "@/hooks/chat-listener/chat-controls/styles";

const EMOTIONS = ["Happy", "Sad", "Angry", "Surprised", "Scared", "Neutral"];
// ================================================================================
// Avatar (or Robot) action controls
// ================================================================================
// TODO: Can add more later, just did these two for now
export default function AvatarActionsGroup({
    connected, // Connection with the backend
    pending,   // Actions that can be pending (waiting for backend acks)
    // Methods to call for each action in this control group
    onEmotion,    // Tell the robot to display an emotion (could work on Buddy) 
    onAnimation, // Tell the robot to play an animation
}: {
    connected : boolean;
    pending   : {
        robot_emotion    : boolean;
        robot_animation  : boolean;
    };
    onEmotion   : (emotion: string) => void;
    onAnimation : (animation: string) => void;
}) {
    // ================================================================================
    // UI Component Group
    // ================================================================================
    return (
        <div className={groupDivStyle}>
            {/* Header */}
            <div className={buttonSectionHeader}>Avatar Actions</div>

            {/* Buttons */}
            <div className="mt-2 grid grid-cols-2 gap-2">
                {EMOTIONS.map((emotion, idx) => {
                    return (
                        <button
                            className = {btnClass(pending.robot_emotion || !connected, "secondary")}
                            disabled  = {pending.robot_emotion || !connected}
                            onClick   = {() => onEmotion(emotion)}
                        >
                            {pending.robot_emotion ? "Sending..." : "Show " + emotion}
                        </button>
                    )
                })}
            </div>
        </div>
    );
}
