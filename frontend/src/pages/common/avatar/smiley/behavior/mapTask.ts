/* The smiley's held prop (the map or the card): picked up, put away, or raised.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/behavior/mapTask`

In the Map Task the avatar plays the instruction follower and holds a map, and
in the cooperative planning task it holds its own card (we see only the back of
either). Plans move the prop with the `prop` action (`HARNESS_PROTOCOL.md`
§3.3): picked up, it slides into view from below the frame; put away, it slides
back down, lowering as it goes; and while held it rises to any height from 0
(its top edge at the chin) to 1 (the eyes peek over it). Picking up the other
prop swaps it in, sliding up from below. Every other change is a timed ease from
wherever the prop is now, so a change partway through never jumps. The face
controller steps this every frame and draws the prop from these amounts.

*/
import type { PropAction, PropName } from "@/hooks/live-chat/avatarPlanFrames";
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
    kind  : PropName;   // Which prop is in hand (or was, while it slides away)
    held  : number;     // How far into view it is held, 0 (put away) to 1
    raise : number;     // 0 (lowered) to 1 (raised)
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
    let kind  : PropName = "map";
    let held  : Ease     = {from: 0, to: 0, startMs: 0, lengthMs: SMILEY_MAP_PICK_UP_MS};
    let raise : Ease     = {from: 0, to: 0, startMs: 0, lengthMs: SMILEY_MAP_RAISE_MS  };

    return {
        // Pick it up or put it away (away, it lowers too, so it comes back lowered), then raise or lower it while it's held
        apply: (action: PropAction, nowMs: number): number => {
            let lengthMs = 0;
            if (action.hold !== undefined) {
                lengthMs = action.move_ms ?? SMILEY_MAP_PICK_UP_MS;

                // The other prop takes the place of the one in hand, sliding up from below the frame
                if ((action.hold !== null) && (action.hold !== kind)) {
                    kind = action.hold;
                    held = {from: 0, to: 0, startMs: nowMs, lengthMs};
                }
                held = easeToward(held, (action.hold === null) ? 0 : 1, lengthMs, nowMs);
                if (action.hold === null) raise = easeToward(raise, 0, action.move_ms ?? SMILEY_MAP_LOWER_MS, nowMs);
            }

            // Without a prop in hand, a raise does nothing (`HARNESS_PROTOCOL.md` §3.3)
            if ((action.raise !== null) && (held.to === 1)) {
                const moveMs = action.move_ms ?? ((action.raise > easeAt(raise, nowMs)) ? SMILEY_MAP_RAISE_MS : SMILEY_MAP_LOWER_MS);
                raise    = easeToward(raise, action.raise, moveMs, nowMs);
                lengthMs = Math.max(lengthMs, moveMs);
            }
            return lengthMs;
        },

        // Which prop it is, and how far it is held and raised this frame
        step: (nowMs: number): MapFrame => ({kind, held: easeAt(held, nowMs), raise: easeAt(raise, nowMs)}),
    };
}
