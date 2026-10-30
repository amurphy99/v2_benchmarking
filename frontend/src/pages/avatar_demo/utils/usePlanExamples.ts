/* Send the demo's example plans like a backend would, and track how each ends.
--------------------------------------------------------------------------------
`@frontend/src/pages/avatar_demo/utils/usePlanExamples`

Each example (`planExamples`) is a list of frames sent at set times after its
button is clicked, through the same checks and scheduler a chat uses
(`avatarPlanChecks`, `useAvatarPlans`). One example runs at a time. Starting
one stops the running one, and any reply still playing (it starts on a fresh
audio timeline). A `robot_action` or a reset cuts the running one short like a
newer command: its frames not sent yet and its plan's waiting steps are
dropped, but a reply already playing plays on.

An example with a reply plays the sample reply as a new reply: its text
"arrives" at `textAtMs` (the plans see it as the reply's `llm_response`), and
its audio follows after the same "speech synthesis" wait as the page's
simulated turn. The page shows "speaking" while it plays, then "listening".

Every plan asks for its "end" feedback and carries the run's number as its
`turn`, so the page can log how each run ended: finished (its last plan
finished), cancelled, or rejected (with the reason).

*/
import type { RefObject         } from "react";
import      { useEffect, useRef } from "react";

// From this project
import      { parseAvatarPlan, parseAvatarSetup } from "@/hooks/live-chat/avatarPlanChecks";
import type { AvatarFeedback                    } from "@/hooks/live-chat/avatarPlanFrames";
import type { AvatarHandle, ConversationState   } from "@/pages/common/avatar/avatarRegistry";
import type { ReplyAudio                        } from "@/pages/common/avatar/plans/planScheduler";
import      { useAvatarPlans                    } from "@/pages/common/avatar/plans/useAvatarPlans";
import type { ExampleFrame, PlanExample         } from "./planExamples";
import      { DEMO_TURN_SYNTH_MS                } from "./useSimulatedTurn";


// --------------------------------------------------------------------------------
// Example Run Types
// --------------------------------------------------------------------------------
// How an example run ended: its last plan finished, it was cut short, or a frame was rejected
export type ExampleRunEnd = "finished" | "cancelled" | {rejected: string};

// The audio player's parts the examples use (`useAudioPlayer`)
type ExamplePlayer = {
    readReplyTimeline : () => readonly ReplyAudio[];   // Recent replies' moments, for steps timed to a reply
    readAudioLeadMs   : () => number;                  // How far ahead of being heard a reply's first audio is scheduled
    holdNextReply     : (ms: number) => void;          // Hold the next reply's first audio back (a step's `hold_audio_ms`)
    cancelAudio       : () => void;                    // Cut off any reply and open a fresh timeline (during a click)
    systemSpeaking    : boolean;                       // A reply is playing
};

// The sample reply, as an example plays it
type ExampleReplies = {
    nextId : () => number;                   // A new reply's `responseId`
    play   : (responseId: number) => void;   // Play the sample reply as that reply, on the timeline the click opened
};

// The example running now
type ExampleRun = {
    runId      : number;     // The page's number for it (every plan's `turn`)
    lastPlanId : string;     // Its last plan, whose end is the run's end
    timers     : number[];   // Its frames and reply still to come
    ended      : boolean;    // The page was told how it ended
};

// Where the example's reply is: not played, played but not playing yet, or playing
type ReplyStep = "none" | "waiting" | "speaking";

// What the page drives
export type PlanExamples = {
    run             : (example: PlanExample, runId: number) => void;   // Start an example (the running one stops first)
    noteRobotAction : () => void;                                      // A `robot_action` or reset was sent: it cuts the running example short
    stop            : () => void;                                      // Stop the running example and its reply's "speaking" (the page plays its own next)
    clearSetup      : () => void;                                      // Forget the Map Task setup
    setupOn         : boolean;                                         // A setup is on (plans, not the page, set the conversation state)
};


// ================================================================================
// Plan Examples
// ================================================================================
// Send example plans to the page's avatar, play their replies, and report how each run ends
export function usePlanExamples(
    // The avatar
    avatarRef   : RefObject<AvatarHandle | null>,   // Avatar on the page (null until it mounts)
    avatarModel : string,                           // Avatar showing

    // The reply
    player  : ExamplePlayer,    // The audio player replies play through
    replies : ExampleReplies,   // The sample reply

    // The page
    setConversationState : (state: ConversationState) => void,           // The page's conversation-state setter
    onRunEnd             : (runId: number, how: ExampleRunEnd) => void,   // Told once as each run ends
): PlanExamples {
    // Plans and setups run through the hook a chat uses, fed the player's view of the replies
    const feed  = {read: player.readReplyTimeline, leadMs: player.readAudioLeadMs, holdNext: player.holdNextReply};
    const plans = useAvatarPlans(avatarRef, avatarModel, feed, (feedback: AvatarFeedback) => noteFeedback(feedback));

    // The running example, where its reply is, and the latest callbacks (timers and feedback read them)
    const runRef       = useRef<ExampleRun | null>(null);
    const replyStepRef = useRef<ReplyStep>("none");
    const latestRef    = useRef({plans, replies, setConversationState, onRunEnd});
    useEffect(() => { latestRef.current = {plans, replies, setConversationState, onRunEnd}; });

    // --------------------------------------------------------------------------------
    // Ending Runs
    // --------------------------------------------------------------------------------
    // Tell the page how a run ended (once)
    const endRun = (run: ExampleRun, how: ExampleRunEnd): void => {
        if (run.ended) return;
        run.ended = true;
        latestRef.current.onRunEnd(run.runId, how);
    };

    // End the run when its last plan ends, or when any of its frames is rejected (it sends no more)
    // (a rejected setup carries no id: it is the running example's)
    const noteFeedback = (feedback: AvatarFeedback): void => {
        const run = runRef.current;
        if ((run === null) || run.ended || ((feedback.id !== null) && (feedback.turn !== run.runId))) return;
        if (feedback.event === "rejected") {
            run.timers.forEach((timer: number) => window.clearTimeout(timer));
            endRun(run, {rejected: feedback.reason});
        }
        else if ((feedback.event === "ended") && (feedback.id === run.lastPlanId)) endRun(run, feedback.how);
    };

    // Cut the running example short, dropping what it hasn't sent and its plan's waiting steps
    // (while it is still the running example, so its plan's end reaches the log)
    const cancelRun = (): void => {
        const run = runRef.current;
        if (run !== null) run.timers.forEach((timer: number) => window.clearTimeout(timer));
        plans.noteRobotAction();
        if (run !== null) endRun(run, "cancelled");
        runRef.current = null;
    };

    // Stop the running example, and the page's "speaking" for its reply (back to listening)
    const stop = (): void => {
        cancelRun();
        if (replyStepRef.current === "speaking") latestRef.current.setConversationState("listening");
        replyStepRef.current = "none";
    };

    // --------------------------------------------------------------------------------
    // Sending Frames
    // --------------------------------------------------------------------------------
    // Send one frame through a chat's checks (a plan carries the run's number as its `turn`)
    const send = (run: ExampleRun, frame: ExampleFrame): void => {
        if (run.ended) return;
        const latest = latestRef.current.plans;
        if (frame.type === "avatar_setup") {
            const parsed = parseAvatarSetup(frame.data);
            if (parsed.ok) latest.applySetup(parsed.frame);
            else           noteFeedback(parsed.rejection);
            return;
        }
        const parsed = parseAvatarPlan({...frame.data, turn: run.runId});
        if (parsed.ok) latest.runPlan(parsed.frame);
        else           noteFeedback(parsed.rejection);
    };

    // Start an example: stop the running one, open a fresh timeline in the click, and send its frames
    const run = (example: PlanExample, runId: number): void => {
        stop();
        player.cancelAudio();

        // 1) Its frames in time order (its last plan's end is its end)
        const frames  = [...example.frames].sort((a: ExampleFrame, b: ExampleFrame) => a.atMs - b.atMs);
        const planIds = frames.flatMap((frame: ExampleFrame) => (frame.type === "avatar_plan") ? [frame.data.id] : []);
        const current : ExampleRun = {runId, lastPlanId: planIds[planIds.length - 1], timers: [], ended: false};
        runRef.current = current;

        // 2) Later frames on timers (set up before the first frames go, so a rejection can clear them all)
        for (const frame of frames.filter((later: ExampleFrame) => later.atMs > 0)) current.timers.push(window.setTimeout(() => send(current, frame), frame.atMs));

        // 3) Its reply: the text arrives after any frames sent then, and the audio once it is "synthesized"
        if (example.reply !== null) {
            const responseId = latestRef.current.replies.nextId();
            current.timers.push(window.setTimeout(() => latestRef.current.plans.noteReplyText(responseId), example.reply.textAtMs));
            current.timers.push(window.setTimeout(() => {
                replyStepRef.current = "waiting";
                latestRef.current.replies.play(responseId);
            }, example.reply.textAtMs + DEMO_TURN_SYNTH_MS));
        }

        // 4) The frames due now
        for (const frame of frames.filter((first: ExampleFrame) => first.atMs <= 0)) send(current, frame);
    };

    // --------------------------------------------------------------------------------
    // The Reply's "Speaking"
    // --------------------------------------------------------------------------------
    // "speaking" while the example's reply plays, then "listening" (as the chat page shows them)
    useEffect(() => {
        if      (player.systemSpeaking  && (replyStepRef.current === "waiting"))  { replyStepRef.current = "speaking"; latestRef.current.setConversationState("speaking");  }
        else if (!player.systemSpeaking && (replyStepRef.current === "speaking")) { replyStepRef.current = "none";     latestRef.current.setConversationState("listening"); }
    }, [player.systemSpeaking]);

    return {run, noteRobotAction: cancelRun, stop, clearSetup: plans.clearSetup, setupOn: plans.setup !== null};
}
