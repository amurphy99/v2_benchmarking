/* ================================================================================
// AdminControlsPanel
// ================================================================================
Control panel for the admin chat listener page. Contains button groups that all 
send commands to the backend.

Currently three button groups only, and they are not yet implemented on the backend...

// ================================================================================ */

// Utilities
import { ControlState, CommandAck } from "@/hooks/chat-listener/chat-controls/types";
import { useCommandAcks           } from "@/hooks/chat-listener/chat-controls/useCommandAcks";

// Button Groups
import    DevSamplesGroup   from "./controlGroups/DevSamplesGroup";
import  ChatControlsGroup   from "./controlGroups/ChatControlsGroup";
import AvatarActionsGroup   from "./controlGroups/AvatarActionsGroup";
import ResponseControlGroup from "./controlGroups/ResponseControlGroup";

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
    controlState,         // State of the control buttons (e.g. "listeningPaused", "responsesPaused")
    setControlState,      // Apply state updates to the AdminControlPanel (listening or paused)
    registerAckHandler,   // Method that allows us to register something from here as the handler for an ack
}: {
    connected            : boolean;
    onAddSampleMessage   : () => void;
    onAddSampleBiomarker : () => void;
    send                 : (msg: any) => void;
    controlState         : ControlState;
    setControlState      : (fn: (prev: ControlState) => ControlState) => void;
    registerAckHandler   : (fn: (ack:  CommandAck  ) => void        ) => void;
}) {

    // Use the prebuilt hook for handling commands & acks
    const { pending, actions } = useCommandAcks({
        connected,
        send,
        controlState,
        setControlState,
        registerAckHandler,
    });

    // ================================================================================
    // UI Components
    // ================================================================================
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Manually Control How the Robot Responds */}
            <ResponseControlGroup 
                connected          = {connected} 
                manualMode         = {controlState.manualMode} 
                pending={{
                    pause_and_listen   : pending.pause_and_listen,
                    resume_and_respond : pending.resume_and_respond,
                    paraphrase_last    : pending.paraphrase_last,
                    send_custom        : pending.send_custom,
                }}
                onPauseAndListen   = {actions.pauseAndListen  } 
                onResumeAndRespond = {actions.resumeAndRespond}
                onParaphraseLast   = {actions.paraphraseLast  } 
                onSendCustom       = {actions.sendCustom      }
                suggestedDraft     = {null                    }
            />
            
            {/* Chat Response Controls */}
            {/* 
            <ChatControlsGroup
                connected    = {connected}
                controlState = {controlState}
                pending={{
                    pause_listening : pending.pause_listening,
                    pause_responses : pending.pause_responses,
                    respond_now     : pending.respond_now,
                }}
                onToggleListening = {actions.toggleListening}
                onToggleResponses = {actions.toggleResponses}
                onRespondNow      = {actions.respondNow     }
            />
            */}

            {/* Avatar Actions */}
            <AvatarActionsGroup
                connected = {connected}
                pending   = {{
                    robot_emotion    : pending.robot_emotion,
                    robot_animation  : pending.robot_animation,
                }}
                onEmotion    = {actions.robotEmotion   }
                onAnimation  = {actions.robotAnimation}
            />

        </div>
    );
}
