/* The chat's controls: start or pause it, end it, and see what state it is in.
--------------------------------------------------------------------------------
`@frontend/src/pages/chat/components/ChatControls`

One large button starts the chat (or pauses and resumes it), and a second ends
it. A status pill says whether the avatar is listening, and a red dot shows
when an admin has set the chat's audio to be kept.

*/
import type { ReactElement                        } from "react";
import      { BsPauseFill, BsPlayFill, BsStopFill } from "react-icons/bs";


// ================================================================================
// Chat Controls
// ================================================================================
// Start, pause, and end the chat, with its status
export default function ChatControls({started, recording, chatEnding, adminRecording, onStart, onPause, onEnd}: {
    // What the chat is doing
    started        : boolean;   // Started at least once
    recording      : boolean;   // The microphone is on
    chatEnding     : boolean;   // The backend ended the chat (the goodbye may still be playing)
    adminRecording : boolean;   // An admin set the chat's audio to be kept

    // What the buttons do
    onStart : () => void;   // Start the chat, or resume it after a pause
    onPause : () => void;   // Pause it
    onEnd   : () => void;   // Ask to end it
}): ReactElement {
    // Where the chat is, for the status pill
    const status =
        chatEnding ? {label: "Ending the chat…", dot: "bg-status-offline"              } :
        recording  ? {label: "Listening",         dot: "bg-status-live animate-pulse"   } :
        started    ? {label: "Paused",            dot: "bg-status-paused"               } :
                     {label: "Ready to start",    dot: "bg-status-offline"              };

    const buttonBase = "flex items-center gap-3! rounded-full! px-7 py-4! text-xl font-semibold transition disabled:opacity-40";
    return (
        <div className="flex flex-col items-center gap-4! rounded-3xl border border-chat-border! bg-chat-panel px-6 py-5! shadow-sm md:flex-row md:justify-between">
            {/* Status, and whether the audio is being kept */}
            <div className="flex items-center gap-4! text-lg text-chat-text">
                <span className="flex items-center gap-2">
                    <span aria-hidden="true" className={`h-3 w-3 rounded-full ${status.dot}`} />
                    {status.label}
                </span>
                {adminRecording ? (
                    <span className="flex items-center gap-1.5 text-sm font-medium text-status-error">
                        <span aria-hidden="true" className="h-2.5 w-2.5 animate-pulse rounded-full bg-status-error" />
                        Recording
                    </span>
                ) : null}
            </div>

            {/* Start or pause, and end */}
            <div className="flex items-center gap-4!">
                {recording ? (
                    <button className={`${buttonBase} border-2 border-chat-accent bg-chat-panel text-chat-accent hover:bg-chat-accentSoft`} onClick={onPause} disabled={chatEnding}>
                        <BsPauseFill aria-hidden="true" /> Pause
                    </button>
                ) : (
                    <button className={`${buttonBase} bg-chat-accent text-white hover:brightness-110`} onClick={onStart} disabled={chatEnding}>
                        <BsPlayFill aria-hidden="true" /> {started ? "Resume" : "Start"}
                    </button>
                )}
                <button className={`${buttonBase} border-2 border-chat-border text-chat-subtext hover:border-status-error hover:text-status-error`} onClick={onEnd} disabled={chatEnding || !started}>
                    <BsStopFill aria-hidden="true" /> End chat
                </button>
            </div>
        </div>
    );
}
