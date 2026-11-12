/* Let the antenna tips trail the head, on a spring behind each head movement.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/behavior/antenna`

Avatars drawn with antennas (the Robot) bend them by how far their tips trail
behind the head. The tips are pulled toward where the head carries them by a
lightly damped spring, so they lag as a turn, tilt, or sway starts and wobble
for a moment after it stops. The face controller steps this every frame and
writes the result into the face (`antennaSwayX`, `antennaSwayY`), so the
renderer stays a pure function of the face it is given.

*/
import      { clampRange } from "../actions/faceMotions";
import type { FaceState  } from "../state/faceState";

// How far each head movement carries the antenna tips, in face units
const ANTENNA_CARRY_PER_TURN_X = 44;    // A full left or right turn
const ANTENNA_CARRY_PER_TURN_Y = 34;    // A full up or down turn
const ANTENNA_CARRY_PER_DEGREE = 1.9;   // One degree of head tilt (the tips sit well above the tilt's center)
const ANTENNA_CARRY_PER_RADIUS = 100;   // A whole-face shift of one face radius

// Spring pulling the tips after the head (stiffer follows sooner; less damping wobbles longer)
const ANTENNA_SPRING_STIFFNESS = 150;
const ANTENNA_SPRING_DAMPING   = 8;
const ANTENNA_SPRING_SUBSTEPS  = 4;     // Steps per frame, so a long frame stays stable

// Farthest the tips may trail, in face units
const ANTENNA_SWAY_MAX_X = 26;
const ANTENNA_SWAY_MAX_Y = 22;


// --------------------------------------------------------------------------------
// Antenna Types
// --------------------------------------------------------------------------------
// The head movements that carry the antennas
export type HeadPose = Pick<FaceState, "turnX" | "turnY" | "tilt" | "offsetX" | "offsetY">;

// How far the tips trail the head this frame, in face units
export type AntennaSway = {x: number; y: number};

// Where the tips are and how fast they are moving
type TipState = {x: number; y: number; vx: number; vy: number};


// --------------------------------------------------------------------------------
// Antenna Sway
// --------------------------------------------------------------------------------
// Start with the tips at rest wherever the head first carries them
export function createAntennaSway(): (pose: HeadPose, dtSec: number) => AntennaSway {
    let tip: TipState | null = null;

    return (pose: HeadPose, dtSec: number): AntennaSway => {
        // Where the head carries the tips this frame
        const carryX = (pose.turnX * ANTENNA_CARRY_PER_TURN_X) + (pose.tilt * ANTENNA_CARRY_PER_DEGREE) + (pose.offsetX * ANTENNA_CARRY_PER_RADIUS);
        const carryY = (pose.turnY * ANTENNA_CARRY_PER_TURN_Y) + (pose.offsetY * ANTENNA_CARRY_PER_RADIUS);
        if (tip === null) tip = {x: carryX, y: carryY, vx: 0, vy: 0};

        // Pull the tips toward that spot
        const stepSec = dtSec / ANTENNA_SPRING_SUBSTEPS;
        for (let i = 0; i < ANTENNA_SPRING_SUBSTEPS; i++) {
            tip.vx += ((ANTENNA_SPRING_STIFFNESS * (carryX - tip.x)) - (ANTENNA_SPRING_DAMPING * tip.vx)) * stepSec;
            tip.vy += ((ANTENNA_SPRING_STIFFNESS * (carryY - tip.y)) - (ANTENNA_SPRING_DAMPING * tip.vy)) * stepSec;
            tip.x  += tip.vx * stepSec;
            tip.y  += tip.vy * stepSec;
        }

        // How far they trail, up to the farthest an antenna may bend
        return {
            x : clampRange(tip.x - carryX, -ANTENNA_SWAY_MAX_X, ANTENNA_SWAY_MAX_X),
            y : clampRange(tip.y - carryY, -ANTENNA_SWAY_MAX_Y, ANTENNA_SWAY_MAX_Y),
        };
    };
}
