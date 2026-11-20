/* What debug mode calls each switch and timing number, and one line on each.
--------------------------------------------------------------------------------
`@frontend/src/pages/chat/debugLabels`

The debug panel and the timing pills show the names; the help modal shows each
name with its line. A shared feature is keyed by its backend name (the
`set_feature` command's `feature`, as `ChatMode.features` lists it).

*/
// One switch or number: its name on the page, and what it does or measures
export type DebugLabel = {label: string; help: string};

// The timing numbers, by the field `useChatTimings` keeps each one in
export type TimingName = "network" | "delay" | "llm" | "check" | "tts";

// The page's own switches (both act in this browser only)
export const SUBTITLES_LABEL: DebugLabel = {label: "Subtitles", help: "What you said and the avatar's reply, as text under the avatar."};
export const CUES_LABEL: DebugLabel = {
    label : "Cues",
    help  : "The avatar's gestures, glances, and expressions. Off hides them in this browser only, so the avatar looks as it does without cues while the backend keeps running them. The nudge it speaks after a long silence in the planning task still plays.",
};

// The chat type's shared features, switched on the backend
export const FEATURE_LABELS: Record<string, DebugLabel> = {
    backchannels : {label: "Backchannels",       help: "A nod, a tilt of the head, or a short sound (\"mm-hm\") when you pause partway through what you're saying. Hidden while the cues are off."},
    turn_end     : {label: "Wait if unfinished", help: "A quick check runs beside each reply. If you seem to be mid-thought, the avatar gives a sign of listening and holds its reply a moment, and the reply goes out only if you stay quiet."},
    misheard     : {label: "Ask if misheard",    help: "The same check looks for a word that was probably misheard and changes what you meant. Then the avatar asks about it instead of replying."},
};

// The timing pills, in the order they show
export const TIMING_LABELS: Record<TimingName, DebugLabel> = {
    network : {label: "Network", help: "The round trip to the server, from a ping every few seconds. It's the part of every wait that depends on where you are."},
    delay   : {label: "Delay",   help: "From the end of your last word to the avatar's voice starting: the wait you hear. Click it for the latest reply's breakdown."},
    llm     : {label: "LLM",     help: "The reply's own model calls, added up (the reply check isn't counted)."},
    check   : {label: "Check",   help: "The reply check's model call, which runs alongside the reply (shown once a check has run)."},
    tts     : {label: "TTS",     help: "Making the speech for the reply's first sentence (the rest is made while it plays)."},
};
