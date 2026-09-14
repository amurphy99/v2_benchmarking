
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
        set_listening     : boolean;
        set_response_mode : boolean;
        reply_now         : boolean;
    };
    onToggleListening : () => void;
    onToggleResponses : () => void;
    onRespondNow      : () => void;
}) {
    // Derive the paused-ness the buttons and pills read from
    const listeningPaused = controlState.listening     === "paused";
    const responsesPaused = controlState.response_mode === "manual";

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

                    <span className={pillClass(listeningPaused)}>
                        Listening {listeningPaused ? "Paused" : "On"}
                    </span>

                    <span className={pillClass(responsesPaused)}>
                        Responses {responsesPaused ? "Paused" : "On"}
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
                    className = {btnClass(pending.set_listening || !connected, "secondary")}
                    disabled  = {pending.set_listening || !connected}
                    onClick   = {onToggleListening}
                >
                {pending.set_listening
                    ? "Updating..."
                    : listeningPaused
                    ? "Resume listening"
                    : "Pause listening"}
                </button>
                
                {/* -------------------------------------------------------------------------------- */}
                {/* Pause Automatic Responses */}
                {/* -------------------------------------------------------------------------------- */}
                <button
                    className = {btnClass(pending.set_response_mode || !connected, "secondary")}
                    disabled  = {pending.set_response_mode || !connected}
                    onClick   = {onToggleResponses}
                >
                {pending.set_response_mode
                    ? "Updating..."
                    : responsesPaused
                    ? "Resume responses"
                    : "Pause responses"}
                </button>
                    
                {/* -------------------------------------------------------------------------------- */}
                {/* Respond Now */}
                {/* -------------------------------------------------------------------------------- */}
                <button
                    className = {btnClass(pending.reply_now || !connected, "primary")}
                    disabled  = {         pending.reply_now || !connected            }
                    onClick   = {onRespondNow}
                >
                {pending.reply_now ? "Sending..." : "Respond now"}
                </button>

            </div>
        </div>
    );
}
