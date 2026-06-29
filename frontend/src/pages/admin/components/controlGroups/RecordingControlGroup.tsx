/* Recording toggle panel for the admin chat listener page.
--------------------------------------------------------------------------------
`frontend/src/pages/admin/components/controlGroups/RecordingControlGroup.tsx`

Audio is ALWAYS accumulated during a session; this toggle only controls whether
save_stereo_wav() is called at disconnect (i.e., whether the file is persisted).

In other words, by the end of a chat we should always have the full audio for a
ChatSession, we just discard it if the property on the ChatConsumer is stell set
to false when the chat ends. This control group is how that property is set to
true (or back to false).

*/
import { LuCircle, LuSquare } from "react-icons/lu";
import { btnClass, groupDivStyle, buttonSectionHeader } from "@/hooks/chat-listener/chat-controls/styles";

// ================================================================================
// Recording toggle panel for the admin ChatListener page (AdminChat.tsx)
// ================================================================================
export default function RecordingControlGroup({
    connected,
    recordingEnabled,
    pending,
    onToggleRecording,
}: {
    connected         : boolean;
    recordingEnabled  : boolean;
    pending           : boolean;
    onToggleRecording : (enabled: boolean) => void;
}) {
    const isDisabled = !connected || pending;

    // Return UI components
    return (
        <div className={groupDivStyle}>
            <div className={buttonSectionHeader}>Session Recording</div>

            {/* -------------------------------------------------------------------------------- */}
            {/* Status Indicator (only visible when recording is active) */}
            {/* -------------------------------------------------------------------------------- */}
            <div className="mt-2 flex items-center gap-2 min-h-[1.5rem]">
                {recordingEnabled && (
                    <>
                        <span className="h-2.5 w-2.5 rounded-full bg-status-error animate-pulse shrink-0" />
                        <span className="text-sm font-medium text-status-error">Recording in progress</span>
                    </>
                )}
            </div>

            {/* -------------------------------------------------------------------------------- */}
            {/* Toggle Button */}
            {/* -------------------------------------------------------------------------------- */}
            <div className="mt-2">
                <button
                    className = {`${btnClass(isDisabled, recordingEnabled ? "secondary" : "primary")} w-full flex items-center justify-center gap-2`}
                    disabled  = {isDisabled}
                    onClick   = {() => onToggleRecording(!recordingEnabled)}
                >
                    {recordingEnabled
                        ? <><LuSquare  size={14} /> {pending ? "Stopping..." : "Stop Recording"  }</>
                        : <><LuCircle  size={14} /> {pending ? "Starting..." : "Start Recording" }</>
                    }
                </button>
            </div>

            {/* -------------------------------------------------------------------------------- */}
            {/* Text Description (added for extra clarity) */}
            {/* -------------------------------------------------------------------------------- */}
            <p className="mt-2 text-[11px] text-admin-subtext leading-snug">
                {recordingEnabled
                    ? "Audio will be saved when the session ends."
                    : "Audio is buffered but not saved. Toggle on to persist the full recording."}
            </p>
        </div>
    );
}

