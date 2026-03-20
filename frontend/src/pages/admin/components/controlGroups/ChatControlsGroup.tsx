
import { ControlState                                            } from "@/hooks/chat-listener/chat-controls/types";
import { pillClass, btnClass, groupDivStyle, buttonSectionHeader } from "@/hooks/chat-listener/chat-controls/styles";

// ================================================================================
// Chat Response Controls
// ================================================================================
export default function ChatControlsGroup({
    connected,         // Connection with the backend
    controlState,      // State of the command (because here they are toggles)
    pending,           // Actions that can be pending (waiting for backend acks)
    // Methods to call for each action in this control group
    onToggleListening, // Pauses ASR (& biomarkers?) on the backend
    onToggleResponses, // Pauses the backend from automatically responding via ASR
    onRespondNow,      // Tells the backend to send a response immediately
}: {
    connected    : boolean;
    controlState : ControlState;
    pending      : {
        pause_listening : boolean;
        pause_responses : boolean;
        respond_now     : boolean;
    };
    onToggleListening : () => void;
    onToggleResponses : () => void;
    onRespondNow      : () => void;
}) {
    // ================================================================================
    // UI Component Group
    // ================================================================================
    return (
        <div className={groupDivStyle}>

            {/* -------------------------------------------------------------------------------- */}
            {/* Header (with status display) */}
            {/* -------------------------------------------------------------------------------- */}
            <div className="flex items-center justify-between">
                <div className={buttonSectionHeader}>Chat Controls</div>
                <div className="flex gap-2">

                    <span className={pillClass(controlState.listeningPaused)}>
                        Listening {controlState.listeningPaused ? "Paused" : "On"}
                    </span>

                    <span className={pillClass(controlState.responsesPaused)}>
                        Responses {controlState.responsesPaused ? "Paused" : "On"}
                    </span>
                    
                </div>
            </div>

            {/* ================================================================================ */}
            {/* Buttons */}
            {/* ================================================================================ */}
            <div className="mt-2 flex flex-col gap-2">

                {/* -------------------------------------------------------------------------------- */}
                {/* Pause ASR listening */}
                {/* -------------------------------------------------------------------------------- */}
                <button
                    className = {btnClass(pending.pause_listening || !connected, "secondary")}
                    disabled  = {pending.pause_listening || !connected}
                    onClick   = {onToggleListening}
                >
                {pending.pause_listening
                    ? "Updating..."
                    : controlState.listeningPaused
                    ? "Resume listening"
                    : "Pause listening"}
                </button>                    
                
                {/* -------------------------------------------------------------------------------- */}
                {/* Pause Automatic Responses */}
                {/* -------------------------------------------------------------------------------- */}
                <button
                    className = {btnClass(pending.pause_responses || !connected, "secondary")}
                    disabled  = {pending.pause_responses || !connected}
                    onClick   = {onToggleResponses}
                >
                {pending.pause_responses
                    ? "Updating..."
                    : controlState.responsesPaused
                    ? "Resume responses"
                    : "Pause responses"}
                </button>
                    
                {/* -------------------------------------------------------------------------------- */}
                {/* Respond Now */}
                {/* -------------------------------------------------------------------------------- */}
                <button
                    className = {btnClass(pending.respond_now || !connected, "primary")}
                    disabled  = {pending.respond_now || !connected}
                    onClick   = {onRespondNow}
                >
                {pending.respond_now ? "Sending..." : "Respond now"}
                </button>

            </div>
        </div>
    );
}
