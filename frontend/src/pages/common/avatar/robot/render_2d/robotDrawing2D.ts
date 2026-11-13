/* Layout and shape math for the robot: head, screen, ear pads, and antennas.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/robot/render_2d/robotDrawing2D`

Shared by `RobotFace2D` and its parts. Every size is in the smiley's face units
(its face is a radius-100 circle at the origin, and negative y is up), so the
face controller's numbers, the objects' spots, and the held prop land in the
same places on both avatars.

The head is a rounded box with a dark screen set into its front, and the face
is drawn on the screen with the smiley's shape math at the robot's own sizes
(`ROBOT_FACE_LAYOUT`). The head is flat, so a turn is faked two ways. The
features slide toward the turn, and the screen slides half as far, so they move
across the glass. The ear pads and antennas are placed on the head in three
dimensions, turned with it, and drawn flat: the ear pad swinging toward the
viewer shows its end, and the antennas lean with the head.

The antennas also stretch or droop with the face's `antennaPerk` and bend by
how far their tips trail the head (`antennaSwayX`, `antennaSwayY`, from the
controller's antenna layer), so the renderer stays a pure function of the face.

*/
import type { FaceLayout, Point } from "@/pages/common/avatar/smiley/render_2d/faceDrawing2D";
import      { iciclePath        } from "@/pages/common/avatar/smiley/render_2d/faceDrawing2D";
import type { FaceState         } from "@/pages/common/avatar/smiley/state/faceState";

// Head: a rounded box, wider than tall
export const ROBOT_HEAD_W   = 220;
export const ROBOT_HEAD_TOP = -74;   // Height of its top edge
const ROBOT_HEAD_H          = 156;
const ROBOT_HEAD_CORNER_R   = 74;

// Screen: dark glass set into the front of the head
export const ROBOT_SCREEN_W = 184;
export const ROBOT_SCREEN_H = 102;
const ROBOT_SCREEN_Y        = 2;    // Height of its center
const ROBOT_SCREEN_CORNER_R = 48;

// Turning
export const ROBOT_TURN_SHIFT_X = 26;    // Feature slide at a full left or right turn
export const ROBOT_TURN_SHIFT_Y = 20;    // Feature slide at a full up or down turn
const ROBOT_SCREEN_SLIDE        = 0.5;   // Share of that slide the screen makes (the features move across the glass by the rest)

// Cheek lights, in the feature group
export const ROBOT_CHEEK_X = 67;   // Distance from the center line
export const ROBOT_CHEEK_Y = 16;   // Height

// Sizes the robot's features are drawn at: wide-set eyes, and a small mouth close under them.
// Its mouth line is one width from end to end (`RobotMouth2D` strokes it)
export const ROBOT_FACE_LAYOUT: FaceLayout = {
    unit          : 0.4,
    eyeX          : 46,
    eyeY          : -3,
    eyeR          : 15,
    gazeShift     : 9,
    heartEyeR     : 17,
    browGap       : 7,
    browHalfW     : 12,
    browArch      : 3,
    browRaise     : 6,
    browTilt      : 6,
    browW         : 5.5,
    browEndW      : 2.5,
    mouthY        : 18,
    mouthHalfW    : 16,
    mouthCurve    : 12,
    mouthSlant    : 3,
    mouthOpenUp   : 8,
    mouthOpenDown : 17,
    mouthWave     : 3,
    mouthLineW    : 5.5,
    mouthLineEndW : 5.5,
    mouthOutlineW : 4,
};

// Attachments (ear pads, antennas) turn about the head's center, a little further than the features slide
const ROBOT_TURN_DEPTH     = 100;   // How far in front of that center the features sit (sets the angle a slide stands for)
const ROBOT_ATTACH_GAIN    = 1.5;   // Extra turn the attachments make, so a small turn still shows in them
const ROBOT_YAW_PER_TURN   = Math.asin(ROBOT_TURN_SHIFT_X / ROBOT_TURN_DEPTH) * ROBOT_ATTACH_GAIN;
const ROBOT_PITCH_PER_TURN = Math.asin(ROBOT_TURN_SHIFT_Y / ROBOT_TURN_DEPTH) * ROBOT_ATTACH_GAIN;

// Ear pads: short cylinders on the sides of the head
export const ROBOT_EAR_R = 24;   // Half-height
const ROBOT_EAR_Y        = 4;    // Height of their centers
const ROBOT_EAR_OUT      = 12;   // How far they stand out from the side
const ROBOT_EAR_IN       = 8;    // How far they reach in behind the head's edge

// Antennas: two short stalks on top of the head, leaning outward
const ROBOT_ANTENNA_X            = 58;     // Base distance from the center line
const ROBOT_ANTENNA_INSET        = 4;      // Base depth below the head's top edge
const ROBOT_ANTENNA_FORWARD      = 6;      // Base distance in front of the head's center
const ROBOT_ANTENNA_LENGTH       = 32;
const ROBOT_ANTENNA_LEAN         = [0.42, -0.9, 0.1] as const;   // The way the right one points (out, up, and a little toward the viewer)
const ROBOT_ANTENNA_PERK_STRETCH = 0.14;   // Extra length at a full perk
const ROBOT_ANTENNA_DROOP_OUT    = 0.6;    // How far a full droop swings the tip outward, as a share of the length
const ROBOT_ANTENNA_DROOP_DOWN   = 0.55;   // ...and down
const ROBOT_ANTENNA_BEND_AT      = 0.6;    // Where along the stalk it bends
const ROBOT_ANTENNA_BEND_SWAY    = 0.2;    // Share of the tip's sway the bend makes

// Icicles hanging under the head: [x, base width, length] (uneven on purpose)
const ROBOT_ICICLES: [number, number, number][] = [[-84, 8, 9], [-64, 11, 16], [-44, 8, 10], [-22, 13, 22], [-2, 9, 12], [20, 12, 18], [42, 8, 9], [62, 10, 14], [82, 7, 8]];
const ROBOT_ICICLE_INSET = 3;   // How far each icicle's base sits inside the edge it hangs from


// --------------------------------------------------------------------------------
// Drawing Types
// --------------------------------------------------------------------------------
// A point or direction on the head in three dimensions (z is toward the viewer)
type Point3 = [number, number, number];

// Attributes for a `<rect>` with rounded corners
export type RoundedBox = {x: number; y: number; width: number; height: number; rx: number};

// One ear pad: its body beside the head, and the end it shows as it swings toward the viewer
export type EarPadGeometry = {
    x     : number;   // Body's left side and top
    y     : number;
    width : number;   // Body's width (its height is twice `ROBOT_EAR_R`)
    endX  : number;   // Center of its outer end
    endY  : number;
    endRx : number;   // Half-width of the end's face (0 while it faces away)
};

// One antenna: its stalk from the head to its tip
export type AntennaGeometry = {stalk: string; tipX: number; tipY: number};


// ================================================================================
// Turning Attachments
// ================================================================================
// One ear pad, turned with the head (`side` is -1 for the left one, 1 for the right)
export function earPadGeometry(side: number, face: FaceState): EarPadGeometry {
    const inner  = turned([side * ((ROBOT_HEAD_W / 2) - ROBOT_EAR_IN),  ROBOT_EAR_Y, 0], face);
    const outer  = turned([side * ((ROBOT_HEAD_W / 2) + ROBOT_EAR_OUT), ROBOT_EAR_Y, 0], face);
    const facing = turned([side, 0, 0], face)[2];
    return {
        x     : Math.min(inner[0], outer[0]),
        y     : outer[1] - ROBOT_EAR_R,
        width : Math.abs(outer[0] - inner[0]),
        endX  : outer[0],
        endY  : outer[1],
        endRx : ROBOT_EAR_R * Math.max(0, facing),
    };
}

// One antenna, turned with the head, stretched or drooping, and bent by how far its tip trails
export function antennaGeometry(side: number, face: FaceState): AntennaGeometry {
    // 1) Its base on top of the head and the way it points, turned with the head
    const baseX = side * ROBOT_ANTENNA_X;
    const base  = turned([baseX, headTopAt(baseX) + ROBOT_ANTENNA_INSET, ROBOT_ANTENNA_FORWARD], face);
    const lean  = turned([side * ROBOT_ANTENNA_LEAN[0], ROBOT_ANTENNA_LEAN[1], ROBOT_ANTENNA_LEAN[2]], face);

    // 2) A perk stretches it; a droop swings its tip outward and down
    const perk   = Math.max(0,  face.antennaPerk);
    const droop  = Math.max(0, -face.antennaPerk);
    const length = ROBOT_ANTENNA_LENGTH * (1 + (ROBOT_ANTENNA_PERK_STRETCH * perk));
    const tipX   = base[0] + (lean[0] * length) + (side * droop * length * ROBOT_ANTENNA_DROOP_OUT) + face.antennaSwayX;
    const tipY   = base[1] + (lean[1] * length) + (       droop * length * ROBOT_ANTENNA_DROOP_DOWN) + face.antennaSwayY;

    // 3) The stalk bends partway up, a little toward where the tip trails
    const bendX = base[0] + (lean[0] * length * ROBOT_ANTENNA_BEND_AT) + (face.antennaSwayX * ROBOT_ANTENNA_BEND_SWAY);
    const bendY = base[1] + (lean[1] * length * ROBOT_ANTENNA_BEND_AT) + (face.antennaSwayY * ROBOT_ANTENNA_BEND_SWAY);
    return {stalk: `M ${base[0]} ${base[1]} Q ${bendX} ${bendY} ${tipX} ${tipY}`, tipX, tipY};
}

// A point (or direction) on the head, turned with the head
function turned([x, y, z]: Point3, face: FaceState): Point3 {
    // Left and right about the head's upright axis, then up and down about its side-to-side axis
    const yaw     = face.turnX * ROBOT_YAW_PER_TURN;
    const pitch   = face.turnY * ROBOT_PITCH_PER_TURN;
    const turnedX = (x * Math.cos(yaw)) + (z * Math.sin(yaw));
    const turnedZ = (z * Math.cos(yaw)) - (x * Math.sin(yaw));
    return [turnedX, (y * Math.cos(pitch)) + (turnedZ * Math.sin(pitch)), (turnedZ * Math.cos(pitch)) - (y * Math.sin(pitch))];
}


// --------------------------------------------------------------------------------
// Screen
// --------------------------------------------------------------------------------
// Where the screen's center is this frame (it slides a share of the head turn)
export function screenCenter(face: FaceState): Point {
    return [face.turnX * ROBOT_TURN_SHIFT_X * ROBOT_SCREEN_SLIDE, ROBOT_SCREEN_Y + (face.turnY * ROBOT_TURN_SHIFT_Y * ROBOT_SCREEN_SLIDE)];
}

// The glass around the screen's center, pushed out by `grow` on every side
export function screenBox(grow: number): RoundedBox {
    return {x: -(ROBOT_SCREEN_W / 2) - grow, y: -(ROBOT_SCREEN_H / 2) - grow, width: ROBOT_SCREEN_W + (2 * grow), height: ROBOT_SCREEN_H + (2 * grow), rx: ROBOT_SCREEN_CORNER_R + grow};
}


// --------------------------------------------------------------------------------
// Head Edges
// --------------------------------------------------------------------------------
// Icicles hanging from the bottom edge of the head, in the head group's coordinates
export const ROBOT_ICICLE_PATHS = ROBOT_ICICLES.map(([x, width, length]: [number, number, number]): string => {
    // The base follows the head's edge; the tip hangs straight below the middle of the base
    const base = (atX: number): Point => [atX, headBottomAt(atX) - ROBOT_ICICLE_INSET];
    return iciclePath(base(x - (width / 2)), base(x + (width / 2)), length + ROBOT_ICICLE_INSET);
});

// The head's outline, pulled in by `inset` on every side
export function headBox(inset: number): RoundedBox {
    return {x: -(ROBOT_HEAD_W / 2) + inset, y: ROBOT_HEAD_TOP + inset, width: ROBOT_HEAD_W - (2 * inset), height: ROBOT_HEAD_H - (2 * inset), rx: ROBOT_HEAD_CORNER_R - inset};
}

// Height of the head's top edge at a distance from its center line
function headTopAt(x: number): number {
    return ROBOT_HEAD_TOP + cornerRise(x);
}

// Height of the head's bottom edge at a distance from its center line
function headBottomAt(x: number): number {
    return ROBOT_HEAD_TOP + ROBOT_HEAD_H - cornerRise(x);
}

// How far the head's rounded corners pull its top and bottom edges in at a distance from its center line
function cornerRise(x: number): number {
    const intoCorner = Math.max(0, Math.abs(x) - ((ROBOT_HEAD_W / 2) - ROBOT_HEAD_CORNER_R));
    return ROBOT_HEAD_CORNER_R - Math.sqrt((ROBOT_HEAD_CORNER_R * ROBOT_HEAD_CORNER_R) - (intoCorner * intoCorner));
}
