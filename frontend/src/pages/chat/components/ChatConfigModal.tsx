/* Configure-chat modal: the chat type, its cues and task version, subtitles, avatar.
--------------------------------------------------------------------------------
`@frontend/src/pages/chat/components/ChatConfigModal`

The modal edits a draft copy of the page's settings, made fresh each time it
opens. Save hands the draft back to the page; Cancel, Escape, or a click outside
drops it. Picking another chat type moves the draft to that type's default task
version. The page disables the button that opens this once the chat starts, so
the choices are fixed for the whole chat.

It is a native `<dialog>` (focus stays inside, Escape closes it) styled with the
chat theme. Bootstrap's reset (buttons, headings) and its own `!important`
spacing and border classes (`px-5`, `gap-3`, `border`) outrank Tailwind's, so
those classes carry the `!` modifier.

*/
import type { ChangeEvent, MouseEvent, ReactElement, ReactNode, SyntheticEvent } from "react";
import      { useCallback, useState                                           } from "react";
import      { BsChevronDown, BsXLg                                            } from "react-icons/bs";

// From this project
import type { AvatarEntry           } from "@/pages/common/avatar/avatarRegistry";
import      { AVATARS               } from "@/pages/common/avatar/avatarRegistry";
import type { ChatMode, ChatVariant } from "../chatModes";
import      { CHAT_MODES            } from "../chatModes";

// Everything the participant picks before the chat starts
export type ChatConfig = {
    mode      : ChatMode;        // Chat type
    variant   : string | null;   // Task version (null for a chat type without one)
    cues      : boolean;         // Behavioral cues on (sent only for a chat type that has them)
    subtitles : boolean;         // Show the caption with the participant's last words and the reply
    avatar    : string;          // Avatar ID (`AVATARS`)
};

// Footer buttons
const CONFIG_BUTTON_CLASS = "rounded-full! px-6 py-2.5 text-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chat-accent";


// --------------------------------------------------------------------------------
// Modal Pieces
// --------------------------------------------------------------------------------
// One titled group of settings rows
function ConfigSection({title, children}: {title: string; children: ReactNode}): ReactElement {
    return (
        <section className="flex flex-col gap-3!">
            <div className="text-xs font-semibold uppercase tracking-widest text-chat-subtext">{title}</div>
            <div className="divide-y divide-chat-border overflow-hidden rounded-2xl border border-chat-border! bg-chat-panel">{children}</div>
        </section>
    );
}

// One setting: its label and help on the left, its control on the right (stacked on phones when `stack`)
function ConfigRow({label, help, stack = false, disabled = false, children}: {
    label     : string;                 // What the setting is
    help      : string;                 // One sentence under the label
    stack?    : boolean;                // Put the control under the text on narrow screens (for dropdowns)
    disabled? : boolean;                // Dim the row
    children  : ReactNode;              // The control
}): ReactElement {
    return (
        <div className={`flex gap-4! px-5! py-4! ${stack ? "flex-col sm:flex-row sm:items-center" : "items-center"} ${disabled ? "opacity-55" : ""}`}>
            <div className="min-w-0 flex-1">
                <div className="text-lg font-medium leading-snug text-chat-text">{label}</div>
                <div className="mt-0.5 text-sm leading-snug text-chat-subtext">{help}</div>
            </div>
            {children}
        </div>
    );
}

// A themed dropdown with its own chevron
function ConfigSelect({label, value, onChange, children}: {
    label    : string;                                          // Accessible name
    value    : string | number;                                 // Selected option's value
    onChange : (event: ChangeEvent<HTMLSelectElement>) => void; // Called with the change
    children : ReactNode;                                       // The `<option>`s
}): ReactElement {
    return (
        <div className="relative w-full sm:w-56">
            <select
                aria-label = {label}
                className  = "w-full cursor-pointer appearance-none rounded-xl border border-chat-border! bg-chat-stage py-2.5 pl-4! pr-10 text-base font-medium text-chat-text hover:border-chat-subtext! focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-chat-accent"
                onChange   = {onChange}
                value      = {value}
            >
                {children}
            </select>
            <BsChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-chat-subtext" />
        </div>
    );
}

// An on/off switch
function ConfigSwitch({label, checked, disabled = false, onChange}: {
    label     : string;                       // Accessible name
    checked   : boolean;                      // Current value
    disabled? : boolean;                      // Greyed out and fixed
    onChange  : (checked: boolean) => void;   // Called with the new value
}): ReactElement {
    return (
        <button
            aria-checked = {checked}
            aria-label   = {label}
            className    = {`relative h-8 w-14 shrink-0 rounded-full! border-0! p-0! ${checked ? "bg-chat-accent" : "bg-chat-border"} ${disabled ? "cursor-not-allowed" : "cursor-pointer"} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chat-accent`}
            disabled     = {disabled}
            onClick      = {() => onChange(!checked)}
            role         = "switch"
            type         = "button"
        >
            <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-md ${checked ? "left-7" : "left-1"}`} />
        </button>
    );
}


// ================================================================================
// Chat Config Modal
// ================================================================================
// Pick the chat type, cues, task version, subtitles, and avatar before the chat starts
export default function ChatConfigModal({show, config, onClose, onSave}: {
    show    : boolean;                        // Modal is open
    config  : ChatConfig;                     // The page's current settings (each opening's draft starts from these)
    onClose : () => void;                     // Closed without saving
    onSave  : (config: ChatConfig) => void;   // Saved, with the new settings
}): ReactElement | null {
    // Mounting the body on open starts its draft from the page's settings
    return show ? <ConfigDialog config={config} onClose={onClose} onSave={onSave} /> : null;
}


// ================================================================================
// Config Dialog
// ================================================================================
// The open modal and its draft
function ConfigDialog({config, onClose, onSave}: {
    config  : ChatConfig;                     // Where the draft starts
    onClose : () => void;                     // Closed without saving
    onSave  : (config: ChatConfig) => void;   // Saved, with the draft
}): ReactElement {
    const [draft, setDraft] = useState<ChatConfig>(config);
    const ModeIcon = draft.mode.icon;

    // Open as a modal once mounted (React calls this with null on unmount)
    const openDialog = useCallback((node: HTMLDialogElement | null): void => { if (node !== null) node.showModal(); }, []);

    // Escape closes through the page, so its `show` stays in step
    const onCancel = (event: SyntheticEvent<HTMLDialogElement>): void => { event.preventDefault(); onClose(); };

    // A click on the backdrop lands on the dialog itself (the content covers the rest of it)
    const onBackdropClick = (event: MouseEvent<HTMLDialogElement>): void => { if (event.target === event.currentTarget) onClose(); };

    // Another chat type takes its default task version
    const pickMode = (index: number): void => {
        const mode = CHAT_MODES[index];
        setDraft({...draft, mode, variant: mode.variants[0]?.value ?? null});
    };

    // --------------------------------------------------------------------------------
    // Render
    // --------------------------------------------------------------------------------
    return (
        <dialog
            aria-labelledby = "chat-config-title"
            className       = "m-auto w-[min(38rem,calc(100%-2rem))] max-h-[calc(100dvh-2rem)] overflow-hidden rounded-3xl border-0 bg-chat-surface p-0 text-chat-text shadow-2xl backdrop:bg-black/45 backdrop:backdrop-blur-sm"
            onCancel        = {onCancel}
            onClick         = {onBackdropClick}
            ref             = {openDialog}
        >
            <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
                {/* -------------------------------------------------------------------------------- */}
                {/* Title */}
                {/* -------------------------------------------------------------------------------- */}
                <div className="flex items-start justify-between gap-4! px-6 pb-4! pt-6 sm:px-7">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-widest text-chat-subtext">Before you start</div>
                        <div className="mt-1 text-2xl font-semibold text-chat-text" id="chat-config-title">Set up your chat</div>
                        <div className="mt-1 text-base text-chat-subtext">These stay the same once the chat starts.</div>
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

                <div className="flex flex-col gap-7 overflow-y-auto px-6 pb-6 sm:px-7">
                    {/* -------------------------------------------------------------------------------- */}
                    {/* Conversation */}
                    {/* -------------------------------------------------------------------------------- */}
                    <ConfigSection title="Conversation">
                        <ConfigRow help="What you and the avatar will do together." label="Chat type" stack>
                            <ConfigSelect label="Chat type" onChange={(event) => pickMode(Number(event.target.value))} value={CHAT_MODES.indexOf(draft.mode)}>
                                {CHAT_MODES.map((option: ChatMode, index: number) => <option key={option.chatType} value={index}>{option.label}</option>)}
                            </ConfigSelect>
                        </ConfigRow>

                        {/* What the picked chat type is */}
                        <div className="flex gap-4! bg-chat-accentSoft/60 px-5! py-4!">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-chat-accent text-xl text-white">
                                <ModeIcon aria-hidden="true" />
                            </span>
                            <div className="text-base leading-relaxed text-chat-text">{draft.mode.description}</div>
                        </div>

                        {/* Task version, for chat types that have one */}
                        {(draft.variant !== null) ? (
                            <ConfigRow help="Which map or scenario to use." label="Task version" stack>
                                <ConfigSelect label="Task version" onChange={(event) => setDraft({...draft, variant: event.target.value})} value={draft.variant}>
                                    {draft.mode.variants.map((option: ChatVariant) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                </ConfigSelect>
                            </ConfigRow>
                        ) : null}

                        <ConfigRow
                            disabled = {!draft.mode.hasCues}
                            help     = {draft.mode.hasCues ? "The avatar's behavioral cues for this task (off runs the no-cues condition)." : "This chat type has no behavioral cues yet."}
                            label    = "Behavioral cues"
                        >
                            <ConfigSwitch
                                checked  = {draft.mode.hasCues && draft.cues}
                                disabled = {!draft.mode.hasCues}
                                label    = "Behavioral cues"
                                onChange = {(cues: boolean) => setDraft({...draft, cues})}
                            />
                        </ConfigRow>
                    </ConfigSection>

                    {/* -------------------------------------------------------------------------------- */}
                    {/* Display */}
                    {/* -------------------------------------------------------------------------------- */}
                    <ConfigSection title="Display">
                        <ConfigRow help="Show what you said and the avatar's reply as text under the avatar." label="Subtitles">
                            <ConfigSwitch checked={draft.subtitles} label="Subtitles" onChange={(subtitles: boolean) => setDraft({...draft, subtitles})} />
                        </ConfigRow>
                        <ConfigRow help="Starts as the one in your settings. A change here is for this chat only." label="Avatar" stack>
                            <ConfigSelect label="Avatar" onChange={(event) => setDraft({...draft, avatar: event.target.value})} value={draft.avatar}>
                                {AVATARS.map((option: AvatarEntry) => <option key={option.id} value={option.id}>{option.label}</option>)}
                            </ConfigSelect>
                        </ConfigRow>
                    </ConfigSection>
                </div>

                {/* -------------------------------------------------------------------------------- */}
                {/* Actions */}
                {/* -------------------------------------------------------------------------------- */}
                <div className="flex justify-end gap-3! border-t border-chat-border bg-chat-panel px-6 py-4! sm:px-7">
                    <button className={`${CONFIG_BUTTON_CLASS} border-2! border-chat-border! bg-chat-panel text-chat-subtext hover:border-chat-subtext! hover:text-chat-text`} onClick={onClose}               type="button">Cancel</button>
                    <button className={`${CONFIG_BUTTON_CLASS} border-2! border-chat-accent! bg-chat-accent text-white hover:brightness-110`}                                 onClick={() => onSave(draft)} type="button">Save choices</button>
                </div>
            </div>
        </dialog>
    );
}
