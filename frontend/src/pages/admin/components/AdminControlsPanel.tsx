/* Chat controls row on the live chat page: listening, responses, and recording.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/AdminControlsPanel`

Every button sends a command through the page's `useCommandAcks` hook, which
tracks which buttons are waiting on a backend acknowledgement. The avatar's
action buttons live in the page's side column instead (`LiveSidePanel`).

*/
import type { ReactElement } from "react";

// From this project
import type { ControlState   } from "@/hooks/chat-listener/chat-controls/types";
import type { useCommandAcks } from "@/hooks/chat-listener/chat-controls/useCommandAcks";

// Button Groups
import    DevSamplesGroup       from "./controlGroups/DevSamplesGroup";
import    ChatControlsGroup     from "./controlGroups/ChatControlsGroup";
import    ResponseControlGroup  from "./controlGroups/ResponseControlGroup";
import    RecordingControlGroup from "./controlGroups/RecordingControlGroup";

// Pending flags and button actions from the page's command hook
type CommandAcks = ReturnType<typeof useCommandAcks>;


// ================================================================================
// Control panel with commands the admin can send to the backend
// ================================================================================
export function AdminControlsPanel({connected, controlState, pending, actions, onAddSampleMessage, onAddSampleBiomarker}: {
    // Command state
    connected    : boolean;                  // Connection with the backend
    controlState : ControlState;             // Listening, response mode, and recording, as the backend last confirmed
    pending      : CommandAcks["pending"];   // Buttons waiting on a backend acknowledgement
    actions      : CommandAcks["actions"];   // Commands the buttons send

    // Development-only helpers (keeping these for now)
    onAddSampleMessage   : () => void;   // Add sample messages to the page
    onAddSampleBiomarker : () => void;   // Add sample biomarker data to the page
}): ReactElement {
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
