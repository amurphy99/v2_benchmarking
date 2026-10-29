/* Run avatar plans on the client's clock: steps, reply moments, cancelling.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/plans/planScheduler`

A plan's steps run one after another (`AVATAR_PLANS.md` §3-§5). Each step
starts at a moment (the end of the step before, or a moment in a reply: its
text arriving, its first audio, its last audio, or a sentence's first audio)
plus its wait, does its actions through the avatar, and lasts its `ms` (or its
actions' natural length, which the avatar reports). The scheduler is pure
timing: it holds no timers, and the page ticks it every frame with the time and
what it knows about the replies.

The rules it keeps:

  - a newer plan, or a `robot_action`, drops the running plan's waiting steps
    (it ends "cancelled"); actions already started keep playing on the avatar
  - all of a plan's reply moments belong to one reply (unless a step names its
    own `response_id`), picked by its first reply moment: the next reply for
    `reply_text` and `reply_audio`, or for `reply_end` and sentences the reply
    playing when the plan arrived (else the next)
  - a step whose moment has passed by the time it comes up runs at once and
    reports how late it was; a step waiting for a sentence its reply never has
    is dropped, and so is every step still waiting `expire_ms` after its plan
    arrived
  - a plan ends "finished" once its last step's length has passed

`audioHoldMs` says how long the next reply's first audio should wait, so a step
that asked for more lead than the client has (`hold_audio_ms`) still gets it.

*/
import type { AvatarFeedback, AvatarPlan, PlanFeedbackEvent, PlanStep, StepActions } from "@/hooks/live-chat/avatarPlanFrames";

// A step this little behind its time (about two frames) still counts as on time for measuring the next step,
// so frame-to-frame jitter never builds up along a chain of steps (feedback still reports the real lateness)
const PLAN_FRAME_SLACK_MS = 34;


// --------------------------------------------------------------------------------
// Scheduler Types
// --------------------------------------------------------------------------------
// What the audio player knows about one reply's audio, in page time (`performance.now()` ms; each null until known)
export type ReplyAudio = {
    responseId : number;
    startMs    : number | null;                 // Its first audio is heard (known once that chunk is scheduled)
    endMs      : number | null;                 // Its last audio finishes (known once that chunk is scheduled, or when it was cut off)
    sentences  : ReadonlyMap<number, number>;   // When each numbered sentence's first audio is heard
};

// One reply as the scheduler sees it: its audio, and when its text arrived
export type ReplyMarks = ReplyAudio & {textMs: number | null};

// What the page drives
export type PlanScheduler = {
    receive     : (plan: AvatarPlan, nowMs: number, replies: readonly ReplyMarks[]) => void;   // Start a plan (the running plan's waiting steps are dropped)
    cancel      : () => void;                                                                  // Drop the running plan's waiting steps (a `robot_action` arrived)
    tick        : (nowMs: number, replies: readonly ReplyMarks[]) => void;                    // Run the steps that are due, and drop the ones that will never run
    audioHoldMs : (leadMs: number, replies: readonly ReplyMarks[]) => number;                 // How long the next reply's first audio should wait for a step's lead
};

// How a plan picks the reply its moments belong to, and the reply picked (null until it shows up)
type ReplyBinding = {pick: "next_text" | "next_audio" | "now_or_next"; responseId: number | null};

// The plan whose steps are running
type RunningPlan = {
    plan      : AvatarPlan;
    arrivedMs : number;
    next      : number;         // Index of the next step to run
    endMs     : number;         // When the last step that ran ends (the next step's "previous" moment)
    started   : boolean;        // A step has run (so "started" was reported)
    reply     : ReplyBinding;
};

// A plan whose steps have all run (or been dropped), ending once its last step's length has passed
type FinishingPlan = {plan: AvatarPlan; endMs: number};

// When a step can run: at a time, not known yet, or never (its sentence never comes)
type StepTime = number | "unknown" | "never";


// ================================================================================
// Plan Scheduler
// ================================================================================
// Start with no plan running
export function createPlanScheduler(
    runStep  : (actions: StepActions) => number,     // Do a step's actions now; returns how long they take (their natural length, ms)
    feedback : (feedback: AvatarFeedback) => void,   // Send one event back (only the kinds its plan asked for)
): PlanScheduler {
    let running   : RunningPlan | null = null;
    let finishing : FinishingPlan[]   = [];

    // Report one event about a plan, when its feedback mode asks for that kind
    const report = (plan: AvatarPlan, event: PlanFeedbackEvent): void => {
        const wanted = (plan.feedback === "steps") || ((plan.feedback === "end") && (event.event !== "step"));
        if (!wanted) return;
        feedback((plan.turn === null) ? {...event, id: plan.id} : {...event, id: plan.id, turn: plan.turn});
    };

    // Drop the running plan's waiting steps
    const cancel = (): void => {
        if (running === null) return;
        report(running.plan, {event: "ended", how: "cancelled"});
        running = null;
    };

    // --------------------------------------------------------------------------------
    // Running Steps
    // --------------------------------------------------------------------------------
    // Run the running plan's steps that are due, in order
    const runDueSteps = (nowMs: number, replies: readonly ReplyMarks[]): void => {
        const live = running;
        if (live === null) return;
        bindReply(live, replies);

        // 1) Steps still waiting this long after the plan arrived will never run
        if ((nowMs - live.arrivedMs) >= live.plan.expire_ms) {
            for (let i = live.next; i < live.plan.steps.length; i++) report(live.plan, {event: "dropped", step: i, reason: "expired"});
            live.next = live.plan.steps.length;
        }

        // 2) Run every step that is due, in order (a chain of short steps can all come due in one frame)
        while (live.next < live.plan.steps.length) {
            const index = live.next;
            const step  = live.plan.steps[index];
            const time  = stepTime(live, step, replies);
            if (time === "never") {
                report(live.plan, {event: "dropped", step: index, reason: "no such sentence"});
                live.next += 1;
                continue;
            }
            if ((time === "unknown") || (time > nowMs)) break;

            // a) Do it, and report how late it started (and, for a step timed to a reply, where in that reply)
            const naturalMs = runStep(step.actions);
            if (!live.started) {
                live.started = true;
                report(live.plan, {event: "started"});
            }
            const replyStartMs = (step.start_on === "previous") ? null : (replyFor(live, step, replies)?.startMs ?? null);
            const lateMs       = Math.round(nowMs - time);
            report(live.plan, (replyStartMs === null) ? {event: "step", step: index, late_ms: lateMs} : {event: "step", step: index, late_ms: lateMs, reply_ms: Math.round(nowMs - replyStartMs)});

            // b) It lasts its own length from when it started (from its time when only frame jitter made it late)
            const startedMs = ((nowMs - time) <= PLAN_FRAME_SLACK_MS) ? time : nowMs;
            live.endMs = startedMs + (step.ms ?? naturalMs);
            live.next += 1;
        }

        // 3) Every step ran or was dropped: the plan finishes once its last step's length has passed
        if (live.next === live.plan.steps.length) {
            finishing.push({plan: live.plan, endMs: live.endMs});
            running = null;
        }
    };

    // Each frame: run the steps that are due, then end the plans that are done
    const tick = (nowMs: number, replies: readonly ReplyMarks[]): void => {
        runDueSteps(nowMs, replies);

        // Plans whose steps have all run end once their last step's length has passed
        finishing = finishing.filter((done: FinishingPlan): boolean => {
            if (nowMs < done.endMs) return true;
            report(done.plan, {event: "ended", how: "finished"});
            return false;
        });
    };

    // --------------------------------------------------------------------------------
    // Receiving Plans and Holding Audio
    // --------------------------------------------------------------------------------
    return {
        cancel,
        tick,

        // A newer plan drops the running plan's waiting steps, then starts (its steps run on the next tick)
        receive: (plan: AvatarPlan, nowMs: number, replies: readonly ReplyMarks[]): void => {
            cancel();
            running = {plan, arrivedMs: nowMs, next: 0, endMs: nowMs, started: false, reply: pickReply(plan, nowMs, replies)};
        },

        // The most any waiting step wants the next reply's first audio held, within that step's own cap
        audioHoldMs: (leadMs: number, replies: readonly ReplyMarks[]): number => {
            const live = running;
            if (live === null) return 0;
            bindReply(live, replies);
            let holdMs = 0;
            for (const step of live.plan.steps.slice(live.next)) {
                if ((step.start_on !== "reply_audio") || (step.hold_audio_ms === 0)) continue;
                const reply = replyFor(live, step, replies);
                if ((reply !== undefined) && (reply.startMs !== null)) continue;   // Its reply's audio is already scheduled
                holdMs = Math.max(holdMs, Math.min(step.hold_audio_ms, -step.wait_ms - leadMs));
            }
            return holdMs;
        },
    };
}


// --------------------------------------------------------------------------------
// Reply Moments
// --------------------------------------------------------------------------------
// How a plan's reply moments pick their reply, from its first reply moment (one playing as the plan arrives counts for the end and sentences)
function pickReply(plan: AvatarPlan, nowMs: number, replies: readonly ReplyMarks[]): ReplyBinding {
    const first = plan.steps.find((step: PlanStep) => (step.start_on !== "previous") && (step.response_id === null));
    if ((first === undefined) || (first.start_on === "reply_audio")) return {pick: "next_audio", responseId: null};
    if (first.start_on === "reply_text")                             return {pick: "next_text",  responseId: null};
    const playing = replies.find((reply: ReplyMarks) => (reply.startMs !== null) && (reply.startMs <= nowMs) && ((reply.endMs === null) || (reply.endMs > nowMs)));
    return {pick: "now_or_next", responseId: (playing === undefined) ? null : playing.responseId};
}

// Pick the plan's reply once it shows up: the first whose text (or first audio) came at or after the plan's arrival
function bindReply(live: RunningPlan, replies: readonly ReplyMarks[]): void {
    if (live.reply.responseId !== null) return;
    const after = (ms: number | null): boolean => (ms !== null) && (ms >= live.arrivedMs);
    const reply = replies.find((candidate: ReplyMarks) => after((live.reply.pick === "next_text") ? candidate.textMs : candidate.startMs));
    if (reply !== undefined) live.reply.responseId = reply.responseId;
}

// The reply a step's moment belongs to (undefined until it is known)
function replyFor(live: RunningPlan, step: PlanStep, replies: readonly ReplyMarks[]): ReplyMarks | undefined {
    const responseId = step.response_id ?? live.reply.responseId;
    return (responseId === null) ? undefined : replies.find((reply: ReplyMarks) => reply.responseId === responseId);
}

// When a step can run: its moment plus its wait, "unknown" until the moment is known, or "never" for a sentence its reply doesn't have
function stepTime(live: RunningPlan, step: PlanStep, replies: readonly ReplyMarks[]): StepTime {
    const moment = step.start_on;
    if (moment === "previous") return live.endMs + step.wait_ms;
    const reply = replyFor(live, step, replies);
    if (reply === undefined) return "unknown";

    // Its moment in that reply (once the reply's last chunk is scheduled, or it was cut off, every sentence it has is known)
    let momentMs: number | null;
    if      (moment === "reply_text" ) { momentMs = reply.textMs;  }
    else if (moment === "reply_audio") { momentMs = reply.startMs; }
    else if (moment === "reply_end"  ) { momentMs = reply.endMs;   }
    else {
        momentMs = reply.sentences.get(moment.sentence) ?? null;
        if ((momentMs === null) && (reply.endMs !== null)) return "never";
    }
    return (momentMs === null) ? "unknown" : (momentMs + step.wait_ms);
}
