/* What each of debug mode's switches does, and what each timing number measures.
--------------------------------------------------------------------------------
`@frontend/src/pages/chat/components/DebugHelpModal`

Opened from the debug panel's (i) button. It is a native `<dialog>` like the
configure-chat modal: focus stays inside, and Escape, the close button, or a
click outside closes it. Bootstrap's reset and its own spacing and border
classes outrank Tailwind's, so those classes carry the `!` modifier.

*/
import type { MouseEvent, ReactElement, SyntheticEvent } from "react";
import      { useCallback                              } from "react";
import      { BsXLg                                    } from "react-icons/bs";

// From this project
import type { DebugLabel                                                 } from "@/pages/common/debug/debugLabels";
import      { CUES_LABEL, FEATURE_LABELS, SUBTITLES_LABEL, TIMING_LABELS } from "@/pages/common/debug/debugLabels";


// ================================================================================
// Debug Help Modal
// ================================================================================
// The switches and the timing numbers, each with one line on what it does
export default function DebugHelpModal({show, onClose}: {
    show    : boolean;      // Modal is open
    onClose : () => void;   // Closed
}): ReactElement | null {
    return show ? <HelpDialog onClose={onClose} /> : null;
}


// --------------------------------------------------------------------------------
// Help Dialog
// --------------------------------------------------------------------------------
// The open modal
function HelpDialog({onClose}: {onClose: () => void}): ReactElement {
    // Open as a modal once mounted (React calls this with null on unmount)
    const openDialog = useCallback((node: HTMLDialogElement | null): void => { if (node !== null) node.showModal(); }, []);

    // Escape closes through the page, so its `show` stays in step; a click on the backdrop lands on the dialog itself
    const onCancel        = (event: SyntheticEvent<HTMLDialogElement>): void => { event.preventDefault(); onClose(); };
    const onBackdropClick = (event: MouseEvent<HTMLDialogElement>    ): void => { if (event.target === event.currentTarget) onClose(); };

    return (
        <dialog
            aria-labelledby = "debug-help-title"
            className       = "m-auto w-[min(36rem,calc(100%-2rem))] max-h-[calc(100dvh-2rem)] overflow-hidden rounded-3xl border-0 bg-chat-surface p-0 text-chat-text shadow-2xl backdrop:bg-black/45 backdrop:backdrop-blur-sm"
            onCancel        = {onCancel}
            onClick         = {onBackdropClick}
            ref             = {openDialog}
        >
            <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
                {/* Title */}
                <div className="flex items-start justify-between gap-4! px-6 pb-4! pt-6 sm:px-7">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-widest text-chat-subtext">Debug mode</div>
                        <div className="mt-1 text-2xl font-semibold text-chat-text" id="debug-help-title">The debug panel</div>
                    </div>
                    <button
                        aria-label = "Close"
                        className  = "flex h-10 w-10 shrink-0 items-center justify-center rounded-full! border! border-chat-border! bg-chat-panel text-chat-subtext hover:text-chat-text focus-visible:outline-2 focus-visible:outline-chat-accent"
                        onClick    = {onClose}
                        type       = "button"
                    >
                        <BsXLg aria-hidden="true" />
                    </button>
                </div>

                {/* The switches, then the numbers */}
                <div className="flex flex-col gap-6 overflow-y-auto px-6 pb-6 sm:px-7">
                    <HelpSection entries={[SUBTITLES_LABEL, CUES_LABEL, ...Object.values(FEATURE_LABELS)]} title="Switches" />
                    <HelpSection entries={Object.values(TIMING_LABELS)} intro="Each number shows the latest value, then the average for this chat. Click Delay for the latest reply's breakdown." title="Timing" />
                </div>
            </div>
        </dialog>
    );
}

// One titled list of names, each with its line
function HelpSection({title, intro, entries}: {
    title    : string;          // What the list is
    intro?   : string;          // One line before it
    entries  : DebugLabel[];    // Its names and lines
}): ReactElement {
    return (
        <section className="flex flex-col gap-3!">
            <div className="text-xs font-semibold uppercase tracking-widest text-chat-subtext">{title}</div>
            {(intro !== undefined) ? <div className="text-base text-chat-subtext">{intro}</div> : null}
            <dl className="mb-0! divide-y divide-chat-border overflow-hidden rounded-2xl border! border-chat-border! bg-chat-panel">
                {entries.map((entry: DebugLabel) => (
                    <div key={entry.label} className="px-5! py-3!">
                        <dt className="text-base font-semibold text-chat-text">{entry.label}</dt>
                        <dd className="mb-0! mt-0.5 text-sm leading-snug text-chat-subtext">{entry.help}</dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}
