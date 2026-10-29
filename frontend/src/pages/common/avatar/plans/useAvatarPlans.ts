/* Run backend avatar plans and setups on the page's avatar, and send feedback.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/plans/useAvatarPlans`

Shared by the chat page and the avatar demo page. A plan or setup frame is
checked where it arrives (`avatarPlanChecks`); this hook then checks the names
it uses against the shown avatar's catalog (`AvatarEntry.plans`) and runs it:
a plan through the scheduler (`planScheduler`), ticked every animation frame
with what the page knows about the replies, and a setup straight onto the
avatar (again whenever a newly picked avatar mounts). Every rejection is sent
back, and the other feedback each plan asks for.

The page tells it about the replies (the audio player's marks, plus each
`llm_response` as it arrives) and about every `robot_action`, which counts as a
newer plan. `setup` is the session's latest setup: once there is one, the
backend owns the conversation state and the page stops guessing it.

*/
import type { RefObject                                         } from "react";
import      { useCallback, useEffect, useMemo, useRef, useState } from "react";

// From this project
import      { checkPlanNames, checkSetupNames                             } from "@/hooks/live-chat/avatarPlanChecks";
import type { AvatarFeedback, AvatarPlan, AvatarSetup, StepActions        } from "@/hooks/live-chat/avatarPlanFrames";
import type { AvatarHandle                                                } from "../avatarRegistry";
import      { getAvatarEntry                                              } from "../avatarRegistry";
import type { ReplyAudio, ReplyMarks                                      } from "./planScheduler";
import      { createPlanScheduler                                         } from "./planScheduler";

// Replies whose text arrival times are kept (the scheduler only ever looks at the latest few)
const PLAN_REPLY_HISTORY = 8;


// --------------------------------------------------------------------------------
// Avatar Plan Types
// --------------------------------------------------------------------------------
// What the page knows about the replies (from its audio player)
export type ReplyFeed = {
    read     : () => readonly ReplyAudio[];   // The latest replies' scheduled audio, oldest first
    leadMs   : () => number;                  // How far ahead of being heard a reply's first audio is scheduled
    holdNext : (ms: number) => void;          // Hold the next reply's first audio back this long (0 for none)
};

// What the page drives
export type AvatarPlans = {
    runPlan         : (plan: AvatarPlan) => void;       // A checked plan arrived
    applySetup      : (setup: AvatarSetup) => void;     // A checked setup arrived
    noteRobotAction : () => void;                       // A `robot_action` arrived (it drops the running plan's waiting steps)
    noteReplyText   : (responseId: number) => void;     // A reply's `llm_response` arrived
    setup           : AvatarSetup | null;               // The session's latest setup (null until one arrives)
};


// ================================================================================
// Avatar Plans
// ================================================================================
// Run plans and setups on the page's avatar, ticking the plans every frame and sending their feedback
export function useAvatarPlans(
    avatarRef   : RefObject<AvatarHandle | null>,       // Avatar on the page (null until it mounts)
    avatarModel : string | null,                        // Avatar showing (null while the settings load)
    replies     : ReplyFeed,                            // The audio player's view of the replies
    onFeedback  : (feedback: AvatarFeedback) => void,   // Send one feedback event back to the backend
): AvatarPlans {
    // Names the shown avatar can run (null: it can't run plans)
    const catalog = (avatarModel === null) ? null : getAvatarEntry(avatarModel).plans;

    // Latest callbacks, read from the frame loop and the scheduler
    const feedbackRef = useRef(onFeedback);
    const repliesRef  = useRef(replies);
    useEffect(() => { feedbackRef.current = onFeedback; }, [onFeedback]);
    useEffect(() => { repliesRef.current  = replies;    }, [replies]);

    // When each reply's text arrived (joined to the player's marks)
    const textAtRef = useRef<Map<number, number>>(new Map());

    // The session's latest setup
    const [setup, setSetup] = useState<AvatarSetup | null>(null);

    // --------------------------------------------------------------------------------
    // Scheduler and Clock
    // --------------------------------------------------------------------------------
    // Steps go to whichever avatar is mounted when they run (none, between avatars, does nothing)
    const scheduler = useMemo(() => createPlanScheduler(
        (actions: StepActions): number => avatarRef.current?.runPlanStep?.(actions) ?? 0,
        (feedback: AvatarFeedback): void => feedbackRef.current(feedback),
    ), [avatarRef]);

    // Every frame: run the steps that are due, and hold the next reply's audio for any step that asked
    useEffect(() => {
        let frameId = 0;
        const tick = (): void => {
            const marks = replyMarks(repliesRef.current.read(), textAtRef.current);
            scheduler.tick(performance.now(), marks);
            repliesRef.current.holdNext(scheduler.audioHoldMs(repliesRef.current.leadMs(), marks));
            frameId = requestAnimationFrame(tick);
        };
        frameId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frameId);
    }, [scheduler]);

    // --------------------------------------------------------------------------------
    // Plans and Setups
    // --------------------------------------------------------------------------------
    // Check a plan's names, then start it (steps already due run right away, not a frame later)
    const runPlan = useCallback((plan: AvatarPlan): void => {
        const problem = (catalog === null) ? "this avatar can't run plans" : checkPlanNames(plan, catalog);
        if (problem !== null) {
            feedbackRef.current((plan.turn === null) ? {id: plan.id, event: "rejected", reason: problem} : {id: plan.id, turn: plan.turn, event: "rejected", reason: problem});
            return;
        }
        const nowMs = performance.now();
        const marks = replyMarks(repliesRef.current.read(), textAtRef.current);
        scheduler.receive(plan, nowMs, marks);
        scheduler.tick(nowMs, marks);
    }, [catalog, scheduler]);

    // Check a setup's names, then keep it as the session's setup
    const applySetup = useCallback((next: AvatarSetup): void => {
        const problem = (catalog === null) ? "this avatar can't take a setup" : checkSetupNames(next, catalog);
        if (problem !== null) {
            feedbackRef.current({id: null, event: "rejected", reason: problem});
            return;
        }
        setSetup(next);
    }, [catalog]);

    // The avatar takes the latest setup, and so does a newly picked one as it mounts
    useEffect(() => {
        if (setup !== null) avatarRef.current?.applySetup?.(setup);
    }, [avatarRef, avatarModel, setup]);

    // Note when a reply's text arrived (keeping only the latest few)
    const noteReplyText = useCallback((responseId: number): void => {
        const textAt = textAtRef.current;
        textAt.delete(responseId);
        textAt.set(responseId, performance.now());
        for (const oldest of textAt.keys()) {
            if (textAt.size <= PLAN_REPLY_HISTORY) break;
            textAt.delete(oldest);
        }
    }, []);

    return {runPlan, applySetup, noteRobotAction: scheduler.cancel, noteReplyText, setup};
}


// --------------------------------------------------------------------------------
// Reply Marks
// --------------------------------------------------------------------------------
// The player's replies with when each one's text arrived, then the replies whose text came but whose audio hasn't yet
function replyMarks(audio: readonly ReplyAudio[], textAt: ReadonlyMap<number, number>): ReplyMarks[] {
    const marks: ReplyMarks[] = audio.map((reply: ReplyAudio): ReplyMarks => ({...reply, textMs: textAt.get(reply.responseId) ?? null}));
    for (const [responseId, textMs] of textAt) {
        if (!audio.some((reply: ReplyAudio) => reply.responseId === responseId)) marks.push({responseId, textMs, startMs: null, endMs: null, sentences: new Map()});
    }
    return marks;
}
