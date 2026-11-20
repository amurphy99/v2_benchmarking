/* Debug mode's timing pills: the total delay, each stage, and the network.
--------------------------------------------------------------------------------
`@frontend/src/pages/chat/components/TimingPills`

Shown under the chat's title in debug mode, the total delay first. Each pill
stacks what it measures (a small label with its icon) over its numbers: the
latest value, then the chat's average (`useChatTimings`; left out on phones, so
the pills fit the screen). Stacked, all five fit in one row on a laptop screen.
Hovering a pill says what it measures. Each kind of number has its own color
and icon, and the reply's own model calls and the reply check share a color, as
both are model calls. The times sit in slots of a fixed width, so a pill keeps
its size as its numbers change, and in a chat type with a reply check the Check
pill holds its place from the start. The Total Delay pill opens the latest
reply's breakdown: how its delay splits into Google finishing the transcript,
the reply being worked out (its model calls, the reply check beside them, and
any hold), the first sentence's speech, and delivery (the rest: the network
both ways, and the page's audio buffer).

*/
import type { ReactElement } from "react";
import      { useState     } from "react";
import type { IconType     } from "react-icons";
import      { BsChevronDown, BsCpu, BsPatchCheck, BsSoundwave, BsStopwatch, BsWifi } from "react-icons/bs";

// From this project
import type { ReplyTimingFrame                    } from "@/hooks/live-chat/debugFrames";
import type { TimingName                          } from "@/pages/common/debug/debugLabels";
import      { REPLY_CHECK_FEATURES, TIMING_LABELS } from "@/pages/common/debug/debugLabels";
import type { ChatTimings, ReplyStage, TimingStat } from "@/pages/common/debug/useChatTimings";
import      { formatMs, replyStages               } from "@/pages/common/debug/useChatTimings";

// The pills' shape: label over numbers (`!`: Bootstrap's border, padding, and fonts win otherwise)
const TIMING_PILL_CLASS = "flex flex-col items-start gap-0.5 whitespace-nowrap rounded-xl! border! px-3! py-1.5! text-left";

// A time's slot, as wide as `formatMs`'s widest time ("980 ms"), so a pill never changes size
const TIMING_SLOT_CLASS = "inline-block min-w-[6.5ch] tabular-nums";

// One kind of number's look: its icon, the pill's colors, and the color of its latest value
type PillLook = {icon: IconType; colors: string; value: string};

// Each number's look (the LLM and Check pills share a color: both are model calls)
const TIMING_PILL_LOOKS: Record<TimingName, PillLook> = {
    delay   : {icon: BsStopwatch,  colors: "border-chat-accent/30! bg-chat-accentSoft text-chat-accent", value: "text-chat-text" },
    network : {icon: BsWifi,       colors: "border-sky-200! bg-sky-50 text-sky-700",                     value: "text-sky-950"   },
    llm     : {icon: BsCpu,        colors: "border-violet-200! bg-violet-50 text-violet-700",            value: "text-violet-950"},
    check   : {icon: BsPatchCheck, colors: "border-violet-200! bg-violet-50 text-violet-700",            value: "text-violet-950"},
    tts     : {icon: BsSoundwave,  colors: "border-amber-200! bg-amber-50 text-amber-700",               value: "text-amber-950" },
};


// --------------------------------------------------------------------------------
// Pill Pieces
// --------------------------------------------------------------------------------
// One number: its icon and name, over its latest value and the chat's average (not on phones)
function PillText({name, stat, expanded}: {
    name      : TimingName;  // Which number
    stat      : TimingStat;  // Its latest value and average
    expanded? : boolean;     // Whether the breakdown it opens is open (left out for a pill that opens nothing)
}): ReactElement {
    const look = TIMING_PILL_LOOKS[name];
    const Icon = look.icon;
    return (
        <>
            {/* What it measures */}
            <span className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase leading-4 tracking-wider">
                <Icon aria-hidden="true" className="shrink-0" />
                {TIMING_LABELS[name].label}
                {(expanded !== undefined) ? <BsChevronDown aria-hidden="true" className={`ml-auto shrink-0 ${expanded ? "rotate-180" : ""}`} /> : null}
            </span>

            {/* The latest value, then the average */}
            <span className="flex items-baseline gap-1.5">
                <span className={`${TIMING_SLOT_CLASS} text-base font-semibold leading-5 ${look.value}`}>{formatMs(stat.last)}</span>
                <span className="hidden items-baseline gap-1 text-xs sm:flex">avg <span className={TIMING_SLOT_CLASS}>{formatMs(stat.average)}</span></span>
            </span>
        </>
    );
}

// One pill (hovering it says what it measures)
function TimingPill({name, stat}: {name: TimingName; stat: TimingStat}): ReactElement {
    return <span className={`${TIMING_PILL_CLASS} ${TIMING_PILL_LOOKS[name].colors}`} title={TIMING_LABELS[name].help}><PillText name={name} stat={stat} /></span>;
}


// ================================================================================
// Timing Pills
// ================================================================================
// Every number's latest value and average, Total Delay first (it opens the reply breakdown)
export default function TimingPills({timings, features}: {
    timings  : ChatTimings;  // Every number, and the latest reply's record (`useChatTimings`)
    features : string[];     // The chat type's shared features (one that runs the reply check shows the Check pill at once)
}): ReactElement {
    const [showBreakdown, setShowBreakdown] = useState(false);

    // With a reply check, the Check pill shows from the start (so it never pushes the TTS pill along)
    const checkShown = features.some((feature: string) => REPLY_CHECK_FEATURES.includes(feature)) || (timings.check.last !== null);

    return (
        <div className="flex flex-col gap-2!">
            {/* The numbers */}
            <div className="flex flex-wrap items-stretch gap-2!">
                <button
                    aria-expanded = {showBreakdown}
                    className     = {`${TIMING_PILL_CLASS} ${TIMING_PILL_LOOKS.delay.colors} cursor-pointer hover:border-chat-accent! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chat-accent`}
                    onClick       = {() => setShowBreakdown(!showBreakdown)}
                    title         = {`${TIMING_LABELS.delay.help} Click for the latest reply's breakdown.`}
                    type          = "button"
                >
                    <PillText expanded={showBreakdown} name="delay" stat={timings.delay} />
                </button>
                <TimingPill name="network" stat={timings.network} />
                <TimingPill name="llm"     stat={timings.llm}     />
                {checkShown ? <TimingPill name="check" stat={timings.check} /> : null}
                <TimingPill name="tts"     stat={timings.tts}     />
            </div>

            {/* The latest reply, stage by stage */}
            {showBreakdown ? <ReplyBreakdown reply={timings.lastReply} /> : null}
        </div>
    );
}


// --------------------------------------------------------------------------------
// Reply Breakdown
// --------------------------------------------------------------------------------
// The latest reply's delay, stage by stage (a stage it didn't have, or that hasn't come in yet, shows "—")
function ReplyBreakdown({reply}: {reply: ReplyTimingFrame | null}): ReactElement {
    if (reply === null) return <div className="text-sm text-chat-subtext">No reply timed yet.</div>;
    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl bg-chat-panel/70 px-4! py-2! text-sm text-chat-subtext">
            <span className="font-semibold text-chat-text">Latest reply:</span>
            {replyStages(reply, reply.delay_ms).map((stage: ReplyStage, index: number) => (
                <span key={stage.label} className="flex items-center gap-2!">
                    {(index > 0) ? <span aria-hidden="true">→</span> : null}
                    <span>
                        {stage.label} <span className="font-semibold text-chat-text">{formatMs(stage.ms)}</span>
                        {(stage.parts !== undefined) ? <span> ({stage.parts.join(", ")})</span> : null}
                    </span>
                </span>
            ))}
            <span aria-hidden="true">=</span>
            <span>{TIMING_LABELS.delay.label} <span className="font-semibold text-chat-text">{formatMs(reply.delay_ms)}</span></span>
        </div>
    );
}
