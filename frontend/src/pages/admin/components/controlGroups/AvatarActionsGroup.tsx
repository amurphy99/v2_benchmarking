
import { btnClass, groupDivStyle, buttonSectionHeader } from "@/hooks/chat-listener/chat-controls/styles";

// ================================================================================
// Avatar (or Robot) action controls
// ================================================================================
// TODO: Can add more later, just did these two for now
export default function AvatarActionsGroup({
    connected, // Connection with the backend
    pending,   // Actions that can be pending (waiting for backend acks)
    // Methods to call for each action in this control group
    onSpin,    // Tell the robot to spin (could work on Buddy) 
    onExcited, // Tell the robot to make the "excited" facial expression
}: {
    connected : boolean;
    pending   : {
        robot_spin    : boolean;
        robot_excited : boolean;
    };
    onSpin    : () => void;
    onExcited : () => void;
}) {
    // ================================================================================
    // UI Component Group
    // ================================================================================
    return (
        <div className={groupDivStyle}>
            {/* Header */}
            <div className={buttonSectionHeader}>Avatar Actions</div>

            {/* Buttons */}
            <div className="mt-2 flex flex-col gap-2">

                {/* -------------------------------------------------------------------------------- */}
                {/* Spin */}
                {/* -------------------------------------------------------------------------------- */}
                <button
                    className = {btnClass(pending.robot_spin || !connected, "secondary")}
                    disabled  = {pending.robot_spin || !connected}
                    onClick   = {onSpin}
                > 
                {pending.robot_spin ? "Sending..." : "Do a spin"}
                </button>

                {/* -------------------------------------------------------------------------------- */}
                {/* Show 'Excited' */}
                {/* -------------------------------------------------------------------------------- */}
                <button
                    className = {btnClass(pending.robot_excited || !connected, "secondary")}
                    disabled  = {pending.robot_excited || !connected}
                    onClick   = {onExcited}
                >
                {pending.robot_excited ? "Sending..." : "Show excited"}
                </button>

            </div>
        </div>
    );
}
