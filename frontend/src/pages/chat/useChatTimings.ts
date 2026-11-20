/* Debug mode's timing: each reply's stages, the connection's round trip, and averages.
--------------------------------------------------------------------------------
`@frontend/src/pages/chat/useChatTimings`

Keeps every reply's timing from the backend's `reply_timing` frames (a later
frame for the same reply replaces the earlier one, adding the delay the user
heard) and every ping's round trip, and works out what the timing pills show:
for each number, the latest value and the chat's average. A reply without that
stage (a scripted line makes no model call) leaves it out of that number.

*/
import { useCallback, useMemo, useState } from "react";

// From this project
import type { ReplyTimingFrame } from "@/hooks/live-chat/debugFrames";
import type { TimingName       } from "./debugLabels";

// The reply check's label among a reply's model calls (`ReplyCheckAPI.check` in `harnesses/features/reply_gate/reply_check_api.py`)
const REPLY_CHECK_LABEL = "check";

// One model call in a reply's timing
export type ModelCall = ReplyTimingFrame["calls"][number];

// One number on the pills: the latest value, and the chat's average (both null before the first)
export type TimingStat = {last: number | null; average: number | null};

// Everything the pills and the breakdown show: each number, and the latest reply's whole record
export type ChatTimings = Record<TimingName, TimingStat> & {lastReply: ReplyTimingFrame | null};


// --------------------------------------------------------------------------------
// A Reply's Model Calls
// --------------------------------------------------------------------------------
// The reply's own model calls: every one but the reply check's
export function ownCalls(timing: ReplyTimingFrame): ModelCall[] {
    return timing.calls.filter((call: ModelCall) => call.label !== REPLY_CHECK_LABEL);
}

// The reply's own model calls, added up (null when it made none)
export function replyLlmMs(timing: ReplyTimingFrame): number | null {
    return totalMs(ownCalls(timing));
}

// The reply check's call (null when it didn't run)
export function replyCheckMs(timing: ReplyTimingFrame): number | null {
    return totalMs(timing.calls.filter((call: ModelCall) => call.label === REPLY_CHECK_LABEL));
}

// Calls' lengths added up (null for no calls)
function totalMs(calls: ModelCall[]): number | null {
    return (calls.length === 0) ? null : calls.reduce((sum: number, call: ModelCall) => sum + call.ms, 0);
}

// The latest value, and the average of the values present (both null when there are none)
function stat(values: (number | null)[]): TimingStat {
    const present = values.filter((value: number | null): value is number => value !== null);
    if (present.length === 0) return {last: null, average: null};
    return {last: present[present.length - 1], average: present.reduce((sum: number, value: number) => sum + value, 0) / present.length};
}


// ================================================================================
// Chat Timings
// ================================================================================
// Collect the chat's reply timings and round trips, and work out the pills' numbers
export function useChatTimings(): {timings: ChatTimings; noteReplyTiming: (timing: ReplyTimingFrame) => void; noteLatency: (ms: number) => void} {
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
        network   : stat(pings),
        delay     : stat(replies.map((reply: ReplyTimingFrame) => reply.delay_ms)),
        llm       : stat(replies.map(replyLlmMs)),
        check     : stat(replies.map(replyCheckMs)),
        tts       : stat(replies.map((reply: ReplyTimingFrame) => reply.tts_ms)),
        lastReply : (replies.length > 0) ? replies[replies.length - 1] : null,
    }), [replies, pings]);

    return {timings, noteReplyTiming, noteLatency};
}
