/* Debug mode's panel under the controls: switches that change the chat as it runs.
--------------------------------------------------------------------------------
`@frontend/src/pages/chat/components/DebugPanel`

A strip of switches, each a pill with a light that shows whether it is on and an
icon beside its name (`debugLabels.ts`): the subtitles and the cues (both
handled in this browser), then the chat type's shared features (switched on the
backend with `set_feature`; a light pulses while a change waits for the
backend). The (i) button opens what each switch and
timing number means (`DebugHelpModal`). Only an account with debug mode on sees
this panel.

*/
import type { ReactElement } from "react";
import      { BsInfoCircle } from "react-icons/bs";

// From this project
import type { SwitchLabel                                 } from "@/pages/common/debug/debugLabels";
import      { CUES_LABEL, FEATURE_LABELS, SUBTITLES_LABEL } from "@/pages/common/debug/debugLabels";
import type { FeatureSwitch                               } from "../useFeatureSwitches";


// --------------------------------------------------------------------------------
// Debug Switch
// --------------------------------------------------------------------------------
// One switch: a pill with its light, icon, and name (`!`: Bootstrap's classes outrank Tailwind's)
function DebugSwitch({name, on, pending = false, disabled = false, note, onFlip}: {
    name      : SwitchLabel;           // What the switch is called, and its icon
    on        : boolean;               // Its state
    pending?  : boolean;               // A change is waiting for the backend
    disabled? : boolean;               // It can't be switched in this chat
    note?     : string;                // Shown on hover (why it can't be switched)
    onFlip    : () => void;            // Flip it
}): ReactElement {
    const Icon  = name.icon;
    const light = pending ? "animate-pulse bg-chat-pending" : on ? "bg-chat-accent" : "bg-chat-border";
    return (
        <button
            aria-checked = {on}
            className    = {`flex min-h-11 items-center gap-2! rounded-full! border! px-4! text-base font-medium ${on ? "border-chat-accent! bg-chat-accentSoft text-chat-text" : "border-chat-border! bg-chat-panel text-chat-subtext"} enabled:hover:border-chat-accent! disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chat-accent`}
            disabled     = {disabled}
            onClick      = {onFlip}
            role         = "switch"
            title        = {note}
            type         = "button"
        >
            <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${light}`} />
            <Icon aria-hidden="true" className={on ? "text-chat-accent" : "text-chat-subtext"} />
            {name.label}
        </button>
    );
}


// ================================================================================
// Debug Panel
// ================================================================================
// The switches, and the button that explains them
export default function DebugPanel({subtitles, cuesShown, hasCues, switches, onSubtitles, onCues, onFeature, onHelp}: {
    // What each switch shows
    subtitles : boolean;           // The caption shows under the avatar
    cuesShown : boolean;           // The cues show on the avatar (this browser only)
    hasCues   : boolean;           // The chat type has cues (without them, the cues switch can't be flipped)
    switches  : FeatureSwitch[];   // The chat type's shared features (none for a chat type without them)

    // What flipping each one does
    onSubtitles : (on: boolean) => void;    // Show or hide the caption
    onCues      : (on: boolean) => void;    // Show or hide the cues
    onFeature   : (name: string) => void;   // Flip one shared feature
    onHelp      : () => void;               // Open what each switch and number means
}): ReactElement {
    return (
        <section aria-label="Debug panel" className="flex flex-col gap-3! rounded-2xl border! border-dashed border-chat-border! bg-chat-panel/70 px-5! py-4!">
            {/* Title, and what each switch does */}
            <div className="flex items-center justify-between gap-3!">
                <div className="text-xs font-semibold uppercase tracking-widest text-chat-subtext">Debug panel</div>
                <button
                    aria-label = "What the debug panel's switches and timing numbers mean"
                    className  = "flex h-9 w-9 items-center justify-center rounded-full! border-0! bg-transparent text-xl text-chat-subtext hover:text-chat-accent focus-visible:outline-2 focus-visible:outline-chat-accent"
                    onClick    = {onHelp}
                    title      = "What these switches and numbers mean"
                    type       = "button"
                >
                    <BsInfoCircle aria-hidden="true" />
                </button>
            </div>

            {/* The page's own switches, then the chat type's shared features */}
            <div className="flex flex-wrap gap-2!">
                <DebugSwitch name={SUBTITLES_LABEL} on={subtitles} onFlip={() => onSubtitles(!subtitles)} />
                <DebugSwitch disabled={!hasCues} name={CUES_LABEL} note={hasCues ? undefined : "This chat type has no cues"} on={hasCues && cuesShown} onFlip={() => onCues(!cuesShown)} />
                {switches.map((feature: FeatureSwitch) => (
                    <DebugSwitch key={feature.name} name={FEATURE_LABELS[feature.name]} on={feature.on} onFlip={() => onFeature(feature.name)} pending={feature.pending} />
                ))}
            </div>
        </section>
    );
}
