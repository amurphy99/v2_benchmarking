/* The smiley's Map Task behavior: holding its map, and raising and lowering it.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/behavior/mapTask`

In the Map Task the avatar plays the instruction follower. It holds a map (we
see only its back), raises it to search, and lowers it to look back at the user.
The face controller steps this every frame and draws the map from two amounts:
how far into view it is held, and how far it is raised.

Picking the map up slides it into view from below the frame, and putting it
away slides it back down. Every change is a timed ease from wherever the map is
now, so a change partway through never jumps.

*/
import type { MapCue, MapTaskConfig } from "../../avatarRegistry";
import      { smoothstep            } from "../actions/faceMotions";

// How long each change takes
const SMILEY_MAP_PICK_UP_MS = 600;   // Sliding into view, or back out of it
const SMILEY_MAP_RAISE_MS   = 450;   // Raising it to search
const SMILEY_MAP_LOWER_MS   = 550;   // Lowering it to look back at the user


// --------------------------------------------------------------------------------
// Map Task Types
// --------------------------------------------------------------------------------
// One amount easing from where it was to a target, over a set time
type Ease = {from: number; to: number; startMs: number; lengthMs: number};

// This frame's map
export type MapFrame = {
    held  : number;   // How far into view it is held, 0 (put away) to 1
    raise : number;   // 0 (lowered) to 1 (raised)
};

// What the face controller drives
export type MapTask = {
    configure : (config: MapTaskConfig | null, nowMs: number) => void;      // Hold the map with these settings (null puts it away)
    cue       : (cue:    MapCue,               nowMs: number) => void;      // Act on one cue (a cue without a map in hand does nothing)
    step      : (nowMs:  number                             ) => MapFrame;  // This frame's map
};


// ================================================================================
// Map Task
// ================================================================================
// Start with the map put away
export function createMapTask(): MapTask {
    let config : MapTaskConfig | null = null;
    let held   : Ease = {from: 0, to: 0, startMs: 0, lengthMs: SMILEY_MAP_PICK_UP_MS};
    let raise  : Ease = {from: 0, to: 0, startMs: 0, lengthMs: SMILEY_MAP_RAISE_MS  };

    // Ease an amount toward a target from wherever it is now (one already heading there keeps going)
    const retarget = (ease: Ease, to: number, lengthMs: number, nowMs: number): Ease => 
        (ease.to === to) ? ease : {from: sampleEase(ease, nowMs), to, startMs: nowMs, lengthMs};

    return {
        // Pick the map up or put it away (it goes away lowered, so it comes back lowered)
        configure: (next: MapTaskConfig | null, nowMs: number): void => {
            config = next;
            held   = retarget(held, (next === null) ? 0 : 1, SMILEY_MAP_PICK_UP_MS, nowMs);
            if (next === null) raise = retarget(raise, 0, SMILEY_MAP_LOWER_MS, nowMs);
        },

        // Raise or lower the map in hand
        cue: (cue: MapCue, nowMs: number): void => {
            if (config === null    ) return;
            if (cue.cue === "raise") { raise = retarget(raise, 1, SMILEY_MAP_RAISE_MS, nowMs); }
            else                     { raise = retarget(raise, 0, SMILEY_MAP_LOWER_MS, nowMs); }
        },

        // How far it is held and raised this frame
        step: (nowMs: number): MapFrame =>
            ({held: sampleEase(held, nowMs), raise: sampleEase(raise, nowMs)}),
    };
}


// Where an ease is now (smoothed, so it starts and stops gently)
function sampleEase(ease: Ease, nowMs: number): number {
    const t = Math.min(Math.max((nowMs - ease.startMs) / ease.lengthMs, 0), 1);
    return ease.from + ((ease.to - ease.from) * smoothstep(t));
}
