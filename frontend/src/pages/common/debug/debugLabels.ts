/* What each switch and timing number is called, and one line on each.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/debug/debugLabels`

Shared by the chat page's debug mode (its panel, timing pills, and help modal)
and the admin live chat page (its feature switches and Timing tab). A shared
feature is keyed by its backend name (the `set_feature` command's `feature`, as
`ChatMode.features` and the control state list it). Each switch also has an
icon for its pill.

*/
import type { IconType                                                          } from "react-icons";
import      { BsBadgeCc, BsChatDots, BsEar, BsHourglassSplit, BsLightningCharge } from "react-icons/bs";

// One switch or number: its name on the page, and what it does or measures
export type DebugLabel = {label: string; help: string};

// One switch: its name and what it does, and the icon on its pill
export type SwitchLabel = DebugLabel & {icon: IconType};

// The timing numbers, by the field `useChatTimings` keeps each one in
export type TimingName = "network" | "delay" | "llm" | "check" | "tts";

// The chat page's own switches (both act in that browser only)
export const SUBTITLES_LABEL: SwitchLabel = {label: "Subtitles", icon: BsBadgeCc, help: "What the participant said and the avatar's reply, as text under the avatar."};
export const CUES_LABEL: SwitchLabel = {
    label : "Cues",
    icon  : BsLightningCharge,
    help  : "The avatar's gestures, glances, and expressions. Off hides them in this browser only, so the avatar looks as it does without cues while the backend keeps running them. The nudge it speaks after a long silence in the planning task still plays.",
};

// The chat types' shared features, switched on the backend
export const FEATURE_LABELS: Record<string, SwitchLabel> = {
    backchannels : {label: "Backchannels",       icon: BsChatDots,       help: "A nod, a tilt of the head, or a short sound (\"mm-hm\") when the participant pauses partway through what they're saying. Hidden on a chat page whose cues are off."},
    turn_end     : {label: "Wait if unfinished", icon: BsHourglassSplit, help: "A quick check runs beside each reply. If the participant seems to be mid-thought, the avatar gives a sign of listening and holds its reply a moment, and the reply goes out only if they stay quiet."},
    misheard     : {label: "Ask if misheard",    icon: BsEar,            help: "The same check looks for a word that was probably misheard and changes what the participant meant. Then the avatar asks about it instead of replying."},
};

// The timing numbers, in the order the pills show them
export const TIMING_LABELS: Record<TimingName, DebugLabel> = {
    network : {label: "Network", help: "The round trip between this page and the server, from a ping every few seconds. It's the part of every wait that depends on where the browser is."},
    delay   : {label: "Delay",   help: "From the end of the participant's last word to the avatar's voice starting: the wait they hear."},
    llm     : {label: "LLM",     help: "The reply's own model calls, added up (the reply check isn't counted)."},
    check   : {label: "Check",   help: "The reply check's model call, which runs alongside the reply."},
    tts     : {label: "TTS",     help: "Making the speech for the reply's first sentence (the rest is made while it plays)."},
};


// What a shared feature is called (the backend can name one this page has no name for yet; it shows as named there)
export function featureLabel(name: string): string {
    return (name in FEATURE_LABELS) ? FEATURE_LABELS[name].label : name;
}
