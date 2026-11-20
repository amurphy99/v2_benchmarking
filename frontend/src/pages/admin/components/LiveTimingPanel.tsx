/* The live chat page's Timing tab: the participant's waits, and each reply's stages.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/LiveTimingPanel`

Built from the backend's `reply_timing` frames (`useChatTimings`), which come
for every chat. At the top, each number's latest value and the chat's average:
the delay the participant heard, the reply's own model calls, the reply check,
and the first sentence's speech. Below, the latest replies, newest first, each
broken down into its stages, with any shared feature that was off for it. The
delay waits for the participant's page to report that the reply's audio
started, so a robot's replies (which play their own speech) show none.

*/
import type { ReactElement } from "react";

// From this project
import type { ReplyTimingFrame                   } from "@/hooks/live-chat/debugFrames";
import type { TimingName                         } from "@/pages/common/debug/debugLabels";
import      { TIMING_LABELS                      } from "@/pages/common/debug/debugLabels";
import type { ChatTimings, ReplyStage            } from "@/pages/common/debug/useChatTimings";
import      { featuresOff, formatMs, replyStages } from "@/pages/common/debug/useChatTimings";

// Replies the tab lists (the averages count every reply)
const LIVE_TIMING_RECENT_REPLIES = 12;

// The numbers the tab shows, in order (the page's own round trip is its Latency pill)
const LIVE_TIMING_NUMBERS: TimingName[] = ["delay", "llm", "check", "tts"];


// ================================================================================
// Live Timing Panel
// ================================================================================
// Each number's latest value and average, then the latest replies stage by stage
export function LiveTimingPanel({timings, replies}: {
    timings : ChatTimings;          // Each number's latest value and average
    replies : ReplyTimingFrame[];   // Every reply's record, oldest first
}): ReactElement {
    const recent = replies.slice(-LIVE_TIMING_RECENT_REPLIES).reverse();
    return (
        <div className="flex flex-col gap-3">
            {/* Each number (hover one for what it measures) */}
            <div className="grid grid-cols-2 gap-2">
                {LIVE_TIMING_NUMBERS.map((name: TimingName) => (
                    <div key={name} className="rounded-xl border border-admin-border bg-admin-panel shadow-sm px-3 py-2" title={TIMING_LABELS[name].help}>
                        <div className="text-[11px] uppercase font-semibold tracking-wide text-admin-subtext">{TIMING_LABELS[name].label}</div>
                        <div className="text-lg font-semibold text-admin-text">{formatMs(timings[name].last)}</div>
                        <div className="text-xs text-admin-subtext">avg {formatMs(timings[name].average)}</div>
                    </div>
                ))}
            </div>

            {/* The latest replies, newest first */}
            <div className="rounded-xl border border-admin-border bg-admin-panel shadow-sm overflow-hidden">
                <div className="px-3 py-2 border-b border-admin-border text-sm font-semibold text-admin-text">Latest replies</div>
                {(recent.length === 0) ? <p className="m-0 px-3 py-3 text-sm text-admin-subtext">No reply timed yet.</p> : null}
                {recent.map((reply: ReplyTimingFrame, index: number) => <ReplyRow key={reply.response_id} number={replies.length - index} reply={reply} />)}
            </div>
        </div>
    );
}


// One reply: its place in the chat and its delay, its stages, and any feature that was off for it
function ReplyRow({number, reply}: {number: number; reply: ReplyTimingFrame}): ReactElement {
    const off    = featuresOff(reply);
    const stages = replyStages(reply, reply.delay_ms).map((stage: ReplyStage) => `${stage.label} ${formatMs(stage.ms)}${(stage.parts !== undefined) ? ` (${stage.parts.join(", ")})` : ""}`);
    return (
        <div className="px-3 py-2 border-b border-admin-border last:border-b-0 text-xs text-admin-subtext">
            <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-admin-text">Reply {number}</span>
                <span>Delay <span className="font-semibold text-admin-text">{formatMs(reply.delay_ms)}</span></span>
            </div>
            <div className="mt-0.5 leading-snug">{stages.join(" → ")}</div>
            {(off.length > 0) ? <div className="mt-0.5">Off: {off.join(", ")}</div> : null}
        </div>
    );
}
