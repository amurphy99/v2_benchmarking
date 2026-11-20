/* Hide a chat's cues on the avatar in this browser, and bring them back as they were.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/plans/useCueHiding`

Debug mode's cues switch acts in the browser only: the backend keeps running the
`cues` condition, and the page stops showing it. The backend's setups and plans
pass through here on their way to the plan runner (`useAvatarPlans`). While the
cues are hidden, the avatar looks as it does in the `no_cues` condition: the
setup's automatic motions are off, the plan running is dropped, the held map or
card is put away, and the backend's plans (its signs of listening among them)
are ignored. Shown again, the latest setup applies as sent, and the session's
first plan runs again, which picks the map or card back up.

NOTE: Cue-driven speech still plays. A reply the backend starts because of a cue
      (the planning chat's nudge after a long silence) is a reply, not a plan.

*/
import { useCallback, useEffect, useRef } from "react";

// From this project
import      { PLAN_DEFAULT_EXPIRE_MS  } from "@/hooks/live-chat/avatarPlanChecks";
import type { AvatarPlan, AvatarSetup } from "@/hooks/live-chat/avatarPlanFrames";
import type { AvatarPlans             } from "./useAvatarPlans";

// The setup's automatic motions with the cues hidden: all off, as the `no_cues` setups have them
const CUES_HIDDEN_AUTO: AvatarSetup["auto"] = {idle_glances: false, thinking_look: false, speech_gaze: false, listening_motions: false};

// Hiding the cues mid-chat: back to rest, the map or card put away, listening (the defaults a plan frame leaves out)
const CUES_HIDDEN_PLAN: AvatarPlan = {
    id        : "cues-hidden",
    turn      : null,
    feedback  : "none",
    expire_ms : PLAN_DEFAULT_EXPIRE_MS,
    steps     : [{start_on: "previous", wait_ms: 0, hold_audio_ms: 0, response_id: null, ms: null, actions: {reset: true, prop: {hold: null, raise: null, move_ms: null}, state: "listening"}}],
};

// What takes the backend's setups and plans in the plan runner's place
export type CueGate = {
    applySetup : (setup: AvatarSetup) => void;  // A setup arrived (applied without its motions while the cues are hidden)
    runPlan    : (plan: AvatarPlan) => void;    // A plan arrived (ignored while the cues are hidden)
    clearSetup : () => void;                    // The session ended (its setup and first plan no longer apply)
};


// ================================================================================
// Cue Hiding
// ================================================================================
// Pass the backend's setups and plans on to the avatar while the cues show, and hold them back while they are hidden
export function useCueHiding(plans: AvatarPlans, hidden: boolean): CueGate {
    const hiddenRef  = useRef(hidden);
    const setupRef   = useRef<AvatarSetup | null>(null);   // The session's latest setup, as the backend sent it
    const openingRef = useRef<AvatarPlan  | null>(null);   // The session's first plan (it picks up the map or card)

    // The latest plan runner (its functions change along with the avatar)
    const plansRef = useRef(plans);
    useEffect(() => { plansRef.current = plans; }, [plans]);

    // A setup is kept as sent, and applied without its motions while the cues are hidden
    const applySetup = useCallback((setup: AvatarSetup): void => {
        setupRef.current = setup;
        plansRef.current.applySetup(hiddenRef.current ? {...setup, auto: CUES_HIDDEN_AUTO} : setup);
    }, []);

    // A plan runs only while the cues show (the session's first one is kept, to run again when they come back)
    const runPlan = useCallback((plan: AvatarPlan): void => {
        if (openingRef.current === null) openingRef.current = plan;
        if (!hiddenRef.current) plansRef.current.runPlan(plan);
    }, []);

    // The session ended: forget its setup and first plan along with the plan runner
    const clearSetup = useCallback((): void => {
        setupRef.current   = null;
        openingRef.current = null;
        plansRef.current.clearSetup();
    }, []);

    // The switch flipped: hide what shows now, or bring back the setup and the first plan
    useEffect(() => {
        if (hiddenRef.current === hidden) return;
        hiddenRef.current = hidden;

        // Nothing shows before the session's setup, or on an avatar that can't take one
        const setup = setupRef.current;
        if ((setup === null) || (plansRef.current.setup === null)) return;

        const runner = plansRef.current;
        if (hidden) { runner.noteRobotAction(); runner.applySetup({...setup, auto: CUES_HIDDEN_AUTO}); runner.runPlan(CUES_HIDDEN_PLAN); }
        else        { runner.applySetup(setup); if (openingRef.current !== null) runner.runPlan(openingRef.current); }
    }, [hidden]);

    return {applySetup, runPlan, clearSetup};
}
