/* Debug mode's timing pills: the network's round trip and each reply's stages.
--------------------------------------------------------------------------------
`@frontend/src/pages/chat/components/TimingPills`

Shown under the chat's title in debug mode. Each pill shows the latest value,
then the chat's average (`useChatTimings`); hovering one says what it measures.
The Delay pill opens the latest reply's breakdown: how its delay splits into
Google finishing the transcript, the reply being worked out (its model calls,
the reply check beside them, and any hold), the first sentence's speech, and
delivery (the rest: the network both ways, and the page's audio buffer).

*/
import type { ReactElement  } from "react";
import      { useState      } from "react";
import      { BsChevronDown } from "react-icons/bs";

// From this project
import type { ReplyTimingFrame                   } from "@/hooks/live-chat/debugFrames";
import type { DebugLabel                         } from "../debugLabels";
import      { TIMING_LABELS                      } from "../debugLabels";
import type { ChatTimings, ModelCall, TimingStat } from "../useChatTimings";
import      { ownCalls, replyCheckMs             } from "../useChatTimings";

// The pills' shared look (Bootstrap's border and spacing classes outrank Tailwind's, hence the `!`)
const TIMING_PILL_CLASS = "flex items-center gap-1.5 rounded-full! border! border-chat-border! bg-chat-panel px-3! py-1 text-sm text-chat-subtext";

// One stage of the breakdown: its name, its time, and what it is made of (when there is more to say)
type BreakdownStage = {label: string; ms: number | null; parts?: string[]};


// --------------------------------------------------------------------------------
// Pill Pieces
// --------------------------------------------------------------------------------
// A time in words: whole milliseconds under a second, else seconds to one decimal ("—" before there is one)
function formatMs(ms: number | null): string {
    if (ms === null) return "—";
    return (ms < 1_000) ? `${Math.round(ms)} ms` : `${(ms / 1_000).toFixed(1)} s`;
}

// One number: its name, the latest value, and the chat's average
function PillText({label, stat}: {label: string; stat: TimingStat}): ReactElement {
    return (
        <>
            {label} <span className="font-semibold text-chat-text">{formatMs(stat.last)}</span> <span>· avg {formatMs(stat.average)}</span>
        </>
    );
}

// One pill (hovering it says what it measures)
function TimingPill({name, stat}: {name: DebugLabel; stat: TimingStat}): ReactElement {
    return <span className={TIMING_PILL_CLASS} title={name.help}><PillText label={name.label} stat={stat} /></span>;
}


// ================================================================================
// Timing Pills
// ================================================================================
// The round trip and each stage's latest value and average, with the Delay pill opening the latest reply's breakdown
export default function TimingPills({timings}: {
    timings : ChatTimings;  // Every number, and the latest reply's record (`useChatTimings`)
}): ReactElement {
    const [showBreakdown, setShowBreakdown] = useState(false);
    return (
        <div className="flex flex-col gap-2!">
            {/* The numbers (the Check pill shows once a reply check has run) */}
            <div className="flex flex-wrap items-center gap-2!">
                <TimingPill name={TIMING_LABELS.network} stat={timings.network} />
                <button
                    aria-expanded = {showBreakdown}
                    className     = {`${TIMING_PILL_CLASS} cursor-pointer hover:border-chat-accent! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chat-accent`}
                    onClick       = {() => setShowBreakdown(!showBreakdown)}
                    title         = {TIMING_LABELS.delay.help}
                    type          = "button"
                >
                    <PillText label={TIMING_LABELS.delay.label} stat={timings.delay} />
                    <BsChevronDown aria-hidden="true" className={showBreakdown ? "rotate-180" : ""} />
                </button>
                <TimingPill name={TIMING_LABELS.llm} stat={timings.llm} />
                {(timings.check.last !== null) ? <TimingPill name={TIMING_LABELS.check} stat={timings.check} /> : null}
                <TimingPill name={TIMING_LABELS.tts} stat={timings.tts} />
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

    // Delivery is whatever the delay leaves once the backend's stages are counted
    const {stt_ms, generate_ms, tts_ms, delay_ms, hold_ms} = reply;
    const delivery = ((stt_ms !== null) && (tts_ms !== null) && (delay_ms !== null)) ? (delay_ms - stt_ms - generate_ms - tts_ms) : null;

    // The reply's work: its own model calls, the reply check alongside them, then any hold
    const check = replyCheckMs(reply);
    const parts = ownCalls(reply).map((call: ModelCall) => `${call.label} ${formatMs(call.ms)}`);
    if (parts.length === 0) parts.push("no model call");
    if (check   !== null)   parts.push(`check ${formatMs(check)} alongside`);
    if (hold_ms !== null)   parts.push(`hold ${formatMs(hold_ms)}`);

    const stages: BreakdownStage[] = [
        {label: "Transcript", ms: stt_ms     },
        {label: "Reply",      ms: generate_ms, parts},
        {label: "TTS",        ms: tts_ms     },
        {label: "Delivery",   ms: delivery   },
    ];
    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl bg-chat-panel/70 px-4! py-2! text-sm text-chat-subtext">
            <span className="font-semibold text-chat-text">Latest reply:</span>
            {stages.map((stage: BreakdownStage, index: number) => (
                <span key={stage.label} className="flex items-center gap-2!">
                    {(index > 0) ? <span aria-hidden="true">→</span> : null}
                    <span>
                        {stage.label} <span className="font-semibold text-chat-text">{formatMs(stage.ms)}</span>
                        {(stage.parts !== undefined) ? <span> ({stage.parts.join(", ")})</span> : null}
                    </span>
                </span>
            ))}
            <span aria-hidden="true">=</span>
            <span>{TIMING_LABELS.delay.label} <span className="font-semibold text-chat-text">{formatMs(delay_ms)}</span></span>
        </div>
    );
}
