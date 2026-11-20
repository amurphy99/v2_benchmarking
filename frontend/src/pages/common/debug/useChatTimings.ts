/* Reply timing for debug mode and the admin pages: each reply's stages, and averages.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/debug/useChatTimings`

The hook keeps every reply's timing from the backend's `reply_timing` frames (a
later frame for the same reply replaces the earlier one, adding the delay the
participant heard) and every ping's round trip, and works out each number the
pills show: the latest value and the chat's average. A reply without that stage
(a scripted line makes no model call) leaves it out of that number. The chat
page's debug mode and the admin live chat page both use it.

The helpers read one reply's record (`ReplyTiming`, live or saved with its
message), so the admin history page uses them too: a reply's own model calls,
its stages for a breakdown, the features switched off for it, and the times in
words.

*/
import { useCallback, useMemo, useState } from "react";

// From this project
import type { ReplyTiming      } from "@/api";
import type { ReplyTimingFrame } from "@/hooks/live-chat/debugFrames";
import type { TimingName       } from "./debugLabels";
import      { featureLabel     } from "./debugLabels";

// The reply check's label among a reply's model calls (`ReplyCheckAPI.check` in `harnesses/features/reply_gate/reply_check_api.py`)
const REPLY_CHECK_LABEL = "check";

// One model call in a reply's timing
export type ModelCall = ReplyTiming["calls"][number];

// One number on the pills: the latest value, and the average (both null before the first)
export type TimingStat = {last: number | null; average: number | null};

// Everything the pills and the breakdown show: each number, and the latest reply's whole record
export type ChatTimings = Record<TimingName, TimingStat> & {lastReply: ReplyTimingFrame | null};

// One stage of a reply's delay: what it was, how long it took, and what it was made of (when there is more to say)
export type ReplyStage = {label: string; ms: number | null; parts?: string[]};


// --------------------------------------------------------------------------------
// A Reply's Model Calls
// --------------------------------------------------------------------------------
// The reply's own model calls: every one but the reply check's
export function ownCalls(timing: ReplyTiming): ModelCall[] {
    return timing.calls.filter((call: ModelCall) => call.label !== REPLY_CHECK_LABEL);
}

// The reply's own model calls, added up (null when it made none)
export function replyLlmMs(timing: ReplyTiming): number | null {
    return totalMs(ownCalls(timing));
}

// The reply check's call (null when it didn't run)
export function replyCheckMs(timing: ReplyTiming): number | null {
    return totalMs(timing.calls.filter((call: ModelCall) => call.label === REPLY_CHECK_LABEL));
}

// Calls' lengths added up (null for no calls)
function totalMs(calls: ModelCall[]): number | null {
    return (calls.length === 0) ? null : calls.reduce((sum: number, call: ModelCall) => sum + call.ms, 0);
}


// --------------------------------------------------------------------------------
// Breakdowns and Words
// --------------------------------------------------------------------------------
// A reply's delay, stage by stage: the transcript finished, the reply worked out (its own calls, the check
// alongside them, any hold), its first sentence's speech, and delivery (whatever the delay leaves)
export function replyStages(timing: ReplyTiming, delayMs: number | null): ReplyStage[] {
    const {stt_ms, generate_ms, tts_ms, hold_ms} = timing;
    const delivery = ((stt_ms !== null) && (tts_ms !== null) && (delayMs !== null)) ? (delayMs - stt_ms - generate_ms - tts_ms) : null;

    // What the reply's work was made of
    const check = replyCheckMs(timing);
    const parts = ownCalls(timing).map((call: ModelCall) => `${call.label} ${formatMs(call.ms)}`);
    if (parts.length === 0) parts.push("no model call");
    if (check   !== null)   parts.push(`check ${formatMs(check)} alongside`);
    if (hold_ms !== null)   parts.push(`hold ${formatMs(hold_ms)}`);

    return [
        {label: "Transcript", ms: stt_ms     },
        {label: "Reply",      ms: generate_ms, parts},
        {label: "TTS",        ms: tts_ms     },
        {label: "Delivery",   ms: delivery   },
    ];
}

// The shared features switched off for a reply, by name
export function featuresOff(timing: ReplyTiming): string[] {
    return Object.entries(timing.features).filter(([, on]: [string, boolean]) => !on).map(([name]: [string, boolean]) => featureLabel(name));
}

// A time in words: whole milliseconds under a second, else seconds to one decimal ("—" when there is none)
export function formatMs(ms: number | null): string {
    if (ms === null) return "—";
    return (ms < 1_000) ? `${Math.round(ms)} ms` : `${(ms / 1_000).toFixed(1)} s`;
}

// The latest value, and the average of the values present (both null when there are none)
export function timingStat(values: (number | null)[]): TimingStat {
    const present = values.filter((value: number | null): value is number => value !== null);
    if (present.length === 0) return {last: null, average: null};
    return {last: present[present.length - 1], average: present.reduce((sum: number, value: number) => sum + value, 0) / present.length};
}


// ================================================================================
// Chat Timings
// ================================================================================
// Collect the chat's reply timings and round trips, and work out the pills' numbers
export function useChatTimings(): {
    timings         : ChatTimings;                         // Each number, and the latest reply's record
    replies         : ReplyTimingFrame[];                  // Every reply's record, oldest first
    noteReplyTiming : (timing: ReplyTimingFrame) => void;  // A `reply_timing` frame arrived
    noteLatency     : (ms: number) => void;                // A ping's round trip came back
} {
    const [replies, setReplies] = useState<ReplyTimingFrame[]>([]);
    const [pings,   setPings  ] = useState<number[]>([]);

    // A reply's later frame replaces its earlier one in place
    const noteReplyTiming = useCallback((timing: ReplyTimingFrame): void => {
        setReplies((known: ReplyTimingFrame[]) => known.some((reply: ReplyTimingFrame) => reply.response_id === timing.response_id)
            ? known.map((reply: ReplyTimingFrame) => (reply.response_id === timing.response_id) ? timing : reply)
            : [...known, timing]);
    }, []);

    // Each ping's round trip
    const noteLatency = useCallback((ms: number): void => { setPings((known: number[]) => [...known, ms]); }, []);

    // Each number's latest value and average
    const timings = useMemo((): ChatTimings => ({
        network   : timingStat(pings),
        delay     : timingStat(replies.map((reply: ReplyTimingFrame) => reply.delay_ms)),
        llm       : timingStat(replies.map(replyLlmMs)),
        check     : timingStat(replies.map(replyCheckMs)),
        tts       : timingStat(replies.map((reply: ReplyTimingFrame) => reply.tts_ms)),
        lastReply : (replies.length > 0) ? replies[replies.length - 1] : null,
    }), [replies, pings]);

    return {timings, replies, noteReplyTiming, noteLatency};
}
