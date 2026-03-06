import { memo, useEffect, useMemo, useRef, useState } from "react";
import { btnClass, groupDivStyle, buttonSectionHeader } from "@/hooks/chat-listener/chat-controls/styles";

// --------------------------------------------------------------------------------
// Define Types
// --------------------------------------------------------------------------------
type Pending = Partial<{
    pause_and_listen   : boolean;
    resume_and_respond : boolean;
    paraphrase_last    : boolean;
    send_custom        : boolean;
}>;

// manualMode is:
//     TRUE only after backend ACK confirms pause/listen entered.
//     FALSE when in normal automatic responses mode.
type Props = {
    connected   : boolean;
    manualMode  : boolean;
    pending    ?: Pending;

    // Commands (send to backend; parent flips manualMode only on ACK)
    onPauseAndListen   : () => void;
    onResumeAndRespond : () => void;
    onParaphraseLast   : () => void;
    onSendCustom       : (text: string) => void;

    // If I decide to have the backend ever do "suggested drafts" where the admin can edit it before approving
    suggestedDraft?: string | null;
};


// ================================================================================
// Control group for manually handlingrRobot responses
// ================================================================================
export default memo(function ResponseControlGroup({
    connected,
    manualMode,
    pending,
    onPauseAndListen,
    onResumeAndRespond,
    onParaphraseLast,
    onSendCustom,
    suggestedDraft = null,
}: Props) {
    // Keep track of the different pending states (each command type waits for acks)
    const p = useMemo(() => ({
        pause_and_listen   : false,
        resume_and_respond : false,
        paraphrase_last    : false,
        send_custom        : false,
    ...pending,}), [pending]);

    // Controls for drafting custom messages to have the robot say
    const [customEnabled, setCustomEnabled] = useState(false);
    const [draft,         setDraft        ] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    const canType = manualMode && customEnabled && !p.send_custom && !p.resume_and_respond;
    const canSend = canType && draft.trim().length > 0;

    // Reset local UI when leaving manual mode (after ack + transition)
    useEffect(() => { if (!manualMode) {setCustomEnabled(false); setDraft("");} }, [manualMode]);

    // If backend provides a suggested draft (e.g., paraphrase), load it + open editor
    useEffect(() => {
        if (!suggestedDraft || !manualMode) return;
        setCustomEnabled(true);
        setDraft(suggestedDraft);
        requestAnimationFrame(() => textareaRef.current?.focus());
    }, [suggestedDraft, manualMode]);

    // Disable everything if we aren't connected
    const disabled = (isPending: boolean) => isPending || !connected;

    // Style helpers
    const textareaClass =
        "w-full min-h-[7.5rem] resize-none rounded-xl border border-black/10 bg-white px-3 py-2 text-sm " +
        (canType ? "focus:outline-none focus:ring-2 focus:ring-black/10" : "opacity-60");

    // ================================================================================
    // UI Components
    // ================================================================================
    return (
        <div className={groupDivStyle}>
        <div className={buttonSectionHeader}>Manual Response Controls</div>

        {/* -------------------------------------------------------------------------------- */}
        {/* First Button Row */}
        {/* -------------------------------------------------------------------------------- */}
        <div className="mt-2 grid grid-cols-2 gap-2">
            {/* Paraphrase Last Question (changes to listening when in manual mode) */}
            {!manualMode ? (
                <button
                    className = {btnClass(disabled(p.pause_and_listen), "secondary")}
                    disabled  = {disabled(p.pause_and_listen)}
                    onClick   = {onPauseAndListen}
                >{p.pause_and_listen ? "Pausing..." : "Pause & Listen"}</button>
            ) : (
            <button className={btnClass(true, "secondary")} disabled aria-disabled>
                <span className="inline-flex items-center gap-2">
                    <span className="opacity-80">Listening</span>
                    <span className="animate-pulse">…</span>
                </span>
            </button>
            )}

            {/* Resume & Respond */}
            <button
                className = {btnClass(disabled(p.resume_and_respond) || !manualMode, "primary")}
                disabled  = {disabled(p.resume_and_respond) || !manualMode}
                onClick   = {onResumeAndRespond}
            >{p.resume_and_respond ? "Resuming..." : "Resume & Respond"}</button>
        </div>

        {/* -------------------------------------------------------------------------------- */}
        {/* Second Button Row */}
        {/* -------------------------------------------------------------------------------- */}
        <div className="mt-2 grid grid-cols-2 gap-2">
            {/* Paraphrase Last Question */}
            <button
                className = {btnClass(disabled(p.paraphrase_last) || !manualMode || !onParaphraseLast, "secondary")}
                disabled  = {disabled(p.paraphrase_last) || !manualMode || !onParaphraseLast}
                onClick   = {() => onParaphraseLast?.()}
            >{p.paraphrase_last ? "Working..." : "Repeat Last Response"}</button>

            {/* Enable Text Box */}
            <button
                className = {btnClass(!manualMode || p.send_custom || p.resume_and_respond, "secondary")}
                disabled  = {!manualMode || p.send_custom || p.resume_and_respond}
                onClick   = {() => { setCustomEnabled(true); requestAnimationFrame(() => textareaRef.current?.focus()); }}
            >Customize Response</button>
        </div>

        {/* -------------------------------------------------------------------------------- */}
        {/* Text area + Cancel/Send */}
        {/* -------------------------------------------------------------------------------- */}
        <div className="mt-2">
            {/* Text Box */}
            <textarea
                ref         = {textareaRef}
                className   = {textareaClass}
                placeholder = "Type custom response here"
                value       = {draft}
                onChange    = {(e) => setDraft(e.target.value)}
                disabled    = {!canType}
            />

            {/* Cancel & Send buttons below the text box */}
            <div className="mt-2 flex justify-end gap-2">
                <button
                    className = {btnClass(!manualMode || !customEnabled || p.send_custom || p.resume_and_respond, "secondary")}
                    disabled  = {!manualMode || !customEnabled || p.send_custom || p.resume_and_respond} 
                    onClick   = {() => {setDraft(""); setCustomEnabled(false);}}
                >Cancel</button>

                <button className={btnClass(!canSend, "primary")} disabled={!canSend} onClick={() => onSendCustom(draft.trim())}>
                    {p.send_custom ? "Sending..." : "Send"}
                </button>

            </div>
        </div>
        </div>
    );
});