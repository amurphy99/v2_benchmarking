/* When reply audio is heard: the speakers' clock, and recent replies' moments.
--------------------------------------------------------------------------------
`@frontend/src/hooks/live-chat/replyMoments`

A backend plan can time a step to a moment of a reply
(`pages/common/avatar/AVATAR_PLANS.md` §4): its first audio heard, a numbered
sentence's first audio, or its last audio's end. The audio player
(`useAudioPlayer`) notes each chunk it schedules here, in its timeline's own
seconds, and the moments are turned into page time (`performance.now()`) as
they are read, so they follow the speakers' clock. A brand-new timeline's clock
can take a moment to start, and until it runs its reply's moments read as
unknown. When playback is cut off, each reply's moments are frozen in page time
first: one already heard ends then (its later sentences never play), and one
not heard yet never started.

*/
import type { RefObject } from "react";

// Replies whose moments are kept (the plan scheduler only looks at the latest few)
const TTS_REPLY_HISTORY = 8;


// --------------------------------------------------------------------------------
// Reply Types
// --------------------------------------------------------------------------------
// One reply's moments, in page time (`performance.now()` ms)
export type ScheduledReply = {
    responseId : number;
    startMs    : number | null;          // Its first audio heard (null until its timeline's clock runs)
    endMs      : number | null;          // Its last audio's end (null until its `last` chunk is scheduled or it is cut off)
    sentences  : Map<number, number>;    // Each numbered sentence's first audio
};

// One reply as the player keeps it: moments in its timeline's seconds (page time once cut off)
export interface ReplyRecord {
    responseId : number;
    ctx        : AudioContext;            // Timeline its chunks are scheduled on
    startSec   : number;                  // Its first audio, on that timeline
    endSec     : number | null;           // Its last audio's end (null until its `last` chunk is scheduled)
    sentences  : Map<number, number>;     // Each numbered sentence's first audio, on that timeline
    frozen     : ScheduledReply | null;   // Its moments in page time, once it is cut off
}


// --------------------------------------------------------------------------------
// The Speakers' Clock
// --------------------------------------------------------------------------------
// Context time reaching the speakers now (the render clock until the output reports a timestamp)
export function heardTime(ctx: AudioContext): number {
    const stamp = ctx.getOutputTimestamp();
    if ((stamp.contextTime === undefined) || (stamp.performanceTime === undefined) || (stamp.performanceTime <= 0)) return ctx.currentTime;
    return stamp.contextTime + ((performance.now() - stamp.performanceTime) / 1_000);
}

// Whether a timeline's clock is running (a brand-new one's stays at 0 for a moment)
function clockRunning(ctx: AudioContext): boolean {
    return (ctx.state === "running") && (ctx.currentTime > 0);
}


// ================================================================================
// Reply Moments
// ================================================================================
// Note one chunk on its reply: the reply's start, its sentence's start, and the reply's end
// (from its first, numbered, and `last` chunks, in its timeline's seconds)
export function noteReplyChunk(
    replies    : ReplyRecord[],         // The player's recent replies (a new one is added, the oldest dropped)
    responseId : number,                // The reply the chunk belongs to
    sentence   : number | undefined,    // The chunk's sentence number, when the backend sends one
    last       : boolean,               // The chunk is the reply's last
    startSec   : number,                // When it plays, on its timeline
    endSec     : number,                // ...and stops
    ctx        : AudioContext,          // The timeline
): void {
    let reply = replies.find((known: ReplyRecord) => known.responseId === responseId);
    if (reply === undefined) {
        reply = {responseId, ctx, startSec, endSec: null, sentences: new Map(), frozen: null};
        replies.push(reply);
        if (replies.length > TTS_REPLY_HISTORY) replies.shift();
    }

    // A sentence starts with its first chunk
    if ((typeof sentence === "number") && Number.isInteger(sentence) && !reply.sentences.has(sentence)) reply.sentences.set(sentence, startSec);
    if (last) reply.endSec = endSec;
}

// A reply's moments in page time (frozen once cut off; unknown until its timeline's clock runs)
export function replyMoments(reply: ReplyRecord): ScheduledReply {
    if (reply.frozen !== null) return reply.frozen;
    if (!clockRunning(reply.ctx)) return {responseId: reply.responseId, startMs: null, endMs: null, sentences: new Map()};
    const heardMs = (sec: number): number => performance.now() + ((sec - heardTime(reply.ctx)) * 1_000);
    return {
        responseId : reply.responseId,
        startMs    : heardMs(reply.startSec),
        endMs      : (reply.endSec === null) ? null : heardMs(reply.endSec),
        sentences  : new Map([...reply.sentences].map(([sentence, sec]: [number, number]): [number, number] => [sentence, heardMs(sec)])),
    };
}

// Cut off every reply not over yet, freezing its moments in page time before its timeline closes
// (one already heard ends now, without its later sentences; one not heard yet never started)
export function cutOffReplies(repliesRef: RefObject<ReplyRecord[]>, nowMs: number): void {
    const kept: ReplyRecord[] = [];
    for (const reply of repliesRef.current) {
        const moments = replyMoments(reply);
        if ((moments.startMs === null) || (moments.startMs > nowMs)) continue;
        if ((moments.endMs === null) || (moments.endMs > nowMs)) {
            moments.endMs = nowMs;
            for (const [sentence, startMs] of moments.sentences) {
                if (startMs > nowMs) moments.sentences.delete(sentence);
            }
        }
        kept.push({...reply, frozen: moments});
    }
    repliesRef.current = kept;
}
