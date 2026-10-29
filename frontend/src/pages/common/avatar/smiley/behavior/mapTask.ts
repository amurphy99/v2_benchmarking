/* The smiley's held map: picked up or put away, and raised or lowered.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/behavior/mapTask`

In the Map Task the avatar plays the instruction follower and holds a map (we
see only its back). Plans move it with the `prop` action (`AVATAR_PLANS.md`
§3.3): picked up, it slides into view from below the frame; put away, it slides
back down, lowering as it goes; and while held it rises to any height from 0
(its top edge at the chin) to 1 (the eyes peek over it). Every change is a timed
ease from wherever the map is now, so a change partway through never jumps. The
face controller steps this every frame and draws the map from the two amounts.

*/
import type { PropAction           } from "@/hooks/live-chat/avatarPlanFrames";
import type { Ease                 } from "../actions/faceMotions";
import      { easeAt, easeToward   } from "../actions/faceMotions";

// How long each change takes when a plan leaves `move_ms` out
const SMILEY_MAP_PICK_UP_MS = 600;   // Sliding into view, or back out of it
const SMILEY_MAP_RAISE_MS   = 450;   // Raising it
const SMILEY_MAP_LOWER_MS   = 550;   // Lowering it


// --------------------------------------------------------------------------------
// Map Types
// --------------------------------------------------------------------------------
// This frame's map
export type MapFrame = {
    held  : number;   // How far into view it is held, 0 (put away) to 1
    raise : number;   // 0 (lowered) to 1 (raised)
};

// What the face controller drives
export type MapTask = {
    apply : (action: PropAction, nowMs: number) => number;   // Pick it up, put it away, raise it, or lower it (returns how long that takes, ms)
    step  : (nowMs: number) => MapFrame;                      // This frame's map
};


// ================================================================================
// Map Task
// ================================================================================
// Start with the map put away
export function createMapTask(): MapTask {
    let held  : Ease = {from: 0, to: 0, startMs: 0, lengthMs: SMILEY_MAP_PICK_UP_MS};
    let raise : Ease = {from: 0, to: 0, startMs: 0, lengthMs: SMILEY_MAP_RAISE_MS  };

    return {
        // Pick it up or put it away (away, it lowers too, so it comes back lowered), then raise or lower it while it's held
        apply: (action: PropAction, nowMs: number): number => {
            let lengthMs = 0;
            if (action.hold !== undefined) {
                lengthMs = action.move_ms ?? SMILEY_MAP_PICK_UP_MS;
                held     = easeToward(held, (action.hold === null) ? 0 : 1, lengthMs, nowMs);
                if (action.hold === null) raise = easeToward(raise, 0, action.move_ms ?? SMILEY_MAP_LOWER_MS, nowMs);
            }

            // Without the map in hand, a raise does nothing (`AVATAR_PLANS.md` §3.3)
            if ((action.raise !== null) && (held.to === 1)) {
                const moveMs = action.move_ms ?? ((action.raise > easeAt(raise, nowMs)) ? SMILEY_MAP_RAISE_MS : SMILEY_MAP_LOWER_MS);
                raise    = easeToward(raise, action.raise, moveMs, nowMs);
                lengthMs = Math.max(lengthMs, moveMs);
            }
            return lengthMs;
        },

        // How far it is held and raised this frame
        step: (nowMs: number): MapFrame => ({held: easeAt(held, nowMs), raise: easeAt(raise, nowMs)}),
    };
}
