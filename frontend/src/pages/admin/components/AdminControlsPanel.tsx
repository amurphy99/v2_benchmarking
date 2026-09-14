/* ================================================================================
// AdminControlsPanel
// ================================================================================
Control panel for the admin chat listener page. Contains button groups that all
send commands to the backend.

// ================================================================================ */

// Utilities
import { ControlState, CommandAck } from "@/hooks/chat-listener/chat-controls/types";
import { useCommandAcks           } from "@/hooks/chat-listener/chat-controls/useCommandAcks";
import type { CapabilityProfile   } from "../capabilities/profiles";

// Button Groups
import    DevSamplesGroup       from "./controlGroups/DevSamplesGroup";
import    ChatControlsGroup     from "./controlGroups/ChatControlsGroup";
import    AvatarActionsGroup    from "./controlGroups/AvatarActionsGroup";
import    ResponseControlGroup  from "./controlGroups/ResponseControlGroup";
import    RecordingControlGroup from "./controlGroups/RecordingControlGroup";

// ================================================================================
// Control panel with commands the admin can send to the backend
// ================================================================================
export function AdminControlsPanel({
    connected,            // Connection with the backend

    // Development-only helpers (keeping these for now)
    onAddSampleMessage,   // Add sample messages to the page
    onAddSampleBiomarker, // Add sample biomarker data to the page

    // All used by 'useCommandAcks' hook
    send,                 // Send data through the WebSocket
    controlState,         // State of the control buttons (e.g. "listening", "response_mode")
    setControlState,      // Apply state updates to the AdminControlPanel (listening or paused)
    registerAckHandler,   // Method that allows us to register something from here as the handler for an ack
    capabilities,         // Which robot actions the monitored frontend can actually perform
}: {
    connected            : boolean;
    onAddSampleMessage   : () => void;
    onAddSampleBiomarker : () => void;
    send                 : (msg: any) => void;
    controlState         : ControlState;
    setControlState      : (fn: (prev: ControlState) => ControlState) => void;
    registerAckHandler   : (fn: (ack:  CommandAck  ) => void        ) => void;
    capabilities         : CapabilityProfile;
}) {

    // Use the prebuilt hook for handling commands & acks
    const { pending, actions } = useCommandAcks({
        connected,
        send,
        controlState,
        setControlState,
        registerAckHandler,
    });

    // --------------------------------------------------------------------------------
    // UI Components
    // --------------------------------------------------------------------------------
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Listening and automatic-response controls */}
            <ChatControlsGroup
                connected    = {connected}
                controlState = {controlState}
                pending      = {{
                    set_listening     : pending.set_listening,
                    set_response_mode : pending.set_response_mode,
                    reply_now         : pending.reply_now,
                }}
                onToggleListening = {actions.toggleListening}
                onToggleResponses = {actions.toggleResponses}
                onRespondNow      = {actions.respondNow     }
            />

            {/* Manually Control How the Robot Responds */}
            <ResponseControlGroup
                connected          = {connected}
                responseMode       = {controlState.response_mode}
                pending={{
                    pause_and_listen   : pending.pause_and_listen,
                    resume_and_respond : pending.resume_and_respond,
                    repeat_last        : pending.repeat_last,
                    send_custom        : pending.send_custom,
                }}
                onPauseAndListen   = {actions.pauseAndListen  }
                onResumeAndRespond = {actions.resumeAndRespond}
                onRepeatLast       = {actions.repeatLast      }
                onSendCustom       = {actions.sendCustom      }
                suggestedDraft     = {null                    }
            />

            {/* Avatar Actions (buttons come from the monitored frontend's capability profile) */}
            <AvatarActionsGroup
                connected    = {connected}
                capabilities = {capabilities}
                pending      = {{
                    robot_emotion   : pending.robot_emotion,
                    robot_animation : pending.robot_animation,
                }}
                onEmotion   = {actions.robotEmotion  }
                onAnimation = {actions.robotAnimation}
            />

            {/* Recording Toggle */}
            <RecordingControlGroup
                connected        = {connected}
                recordingEnabled = {controlState.recording_enabled}
                pending          = {pending.set_recording}
                onToggleRecording= {actions.toggleRecording}
            />

        </div>
    );
}
