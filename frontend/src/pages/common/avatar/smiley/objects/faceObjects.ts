/* Objects the smiley shows on and around its face (hands, hearts): how a face places them, and how they blend.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/objects/faceObjects`

An object is something drawn on or around the face that is not one of its own
features: a hand, a floating heart. (The tear and the sleep Zs are still extras,
and heart eyes are an eye style.) A face lists the objects it shows in its
`objects` list. Each one sits at a named spot on the face (`SMILEY_FACE_SPOTS`)
plus its own offset, angle, and size, and has its kind's own settings:

  - hands: one per screen side, "left" and "right". Each shape is drawn for the
    left hand and mirrored for the right one; positions are plain screen
    directions for both.
  - hearts: each heart is its own object, with its own size, bob, pulse, and
    timing (left out, the face's hearts are spread evenly through the bob).

`resolveObjects` turns that list into the numbers `FaceState.objects` holds, in
the feature group's coordinates (face units; objects slide with the head turn
and lean with the head). When two faces blend (`blendObjects`), objects match by
key and shape: a match blends, so the same hand with the same shape slides to
its new spot, and an object in only one of the faces fades out or in where it
is. Animations move objects by key (`applyObjectOffsets`).

The spots reuse the 2D layout's feature positions (`render_2d/faceDrawing2D`).

*/
import { SMILEY_BLUSH_X, SMILEY_BLUSH_Y, SMILEY_EYE_X, SMILEY_EYE_Y, SMILEY_MOUTH_Y } from "../render_2d/faceDrawing2D";

// Where the chin spot sits: just above the bottom of the face
const SMILEY_CHIN_Y = 82;

// Heart settings a face leaves out
const SMILEY_HEART_DEFAULT_BOB   = 4;      // Bob height, in face units
const SMILEY_HEART_DEFAULT_PULSE = 0.12;   // Size change at the top of a pulse


// --------------------------------------------------------------------------------
// Spots
// --------------------------------------------------------------------------------
// Named spots on the face that objects are placed from
export type FaceSpot = "center" | "mouth" | "chin" | "eyeLeft" | "eyeRight" | "cheekLeft" | "cheekRight";

// Each spot, in face units in the feature group's coordinates (negative y is up)
const SMILEY_FACE_SPOTS: Record<FaceSpot, [number, number]> = {
    center     : [ 0,               0             ],
    mouth      : [ 0,               SMILEY_MOUTH_Y],
    chin       : [ 0,               SMILEY_CHIN_Y ],
    eyeLeft    : [-SMILEY_EYE_X,    SMILEY_EYE_Y  ],
    eyeRight   : [ SMILEY_EYE_X,    SMILEY_EYE_Y  ],
    cheekLeft  : [-SMILEY_BLUSH_X,  SMILEY_BLUSH_Y],
    cheekRight : [ SMILEY_BLUSH_X,  SMILEY_BLUSH_Y],
};


// --------------------------------------------------------------------------------
// Object Types
// --------------------------------------------------------------------------------
// Hand shapes (drawn in `render_2d/objectDrawing2D`)
export type HandShapeName = "raised" | "pointing";

// Where any object goes: a spot, plus an offset (face units), an angle (degrees), and a size (times its kind's size)
type Placement = {at: FaceSpot; dx?: number; dy?: number; angle?: number; scale?: number};

// What a face writes to show a hand or a heart (left-out settings take their defaults)
export type HandPlacement   = Placement & {kind: "hand"; side: "left" | "right"; shape: HandShapeName};
export type HeartPlacement  = Placement & {kind: "heart"; bob?: number; pulse?: number; phase?: number};
export type ObjectPlacement = HandPlacement | HeartPlacement;

// A placed object's numbers: its key (what blending and animations match on), how much of it shows, and where it is
type PlacedObject = {key: string; amount: number; x: number; y: number; angle: number; scale: number};

// A placed hand or heart (`phase` is the heart's start in its bob, 0 to 1)
export type HandObject  = PlacedObject & {kind: "hand"; shape: HandShapeName; mirrored: boolean};
export type HeartObject = PlacedObject & {kind: "heart"; bob: number; pulse: number; phase: number};
export type FaceObject  = HandObject | HeartObject;

// Offsets an animation adds to one object (its key in `MotionOffsets.objects`)
export type ObjectOffsets = {dx?: number; dy?: number; angle?: number; scale?: number};


// ================================================================================
// Placing Objects
// ================================================================================
// A face's object list as placed objects, fully shown (hands are keyed by side, hearts by their order)
export function resolveObjects(placements: ObjectPlacement[]): FaceObject[] {
    const heartCount = placements.filter((placement: ObjectPlacement) => placement.kind === "heart").length;
    let   heartIndex = 0;
    return placements.map((placement: ObjectPlacement): FaceObject => {
        // Spot plus offset, angle, and size
        const [spotX, spotY] = SMILEY_FACE_SPOTS[placement.at];
        const placed = {amount: 1, x: spotX + (placement.dx ?? 0), y: spotY + (placement.dy ?? 0), angle: placement.angle ?? 0, scale: placement.scale ?? 1};
        if (placement.kind === "hand") return {...placed, kind: "hand", key: `hand-${placement.side}`, shape: placement.shape, mirrored: placement.side === "right"};

        // Hearts left without a timing are spread evenly through the bob
        heartIndex += 1;
        return {...placed, kind: "heart", key: `heart-${heartIndex}`, bob: placement.bob ?? SMILEY_HEART_DEFAULT_BOB, pulse: placement.pulse ?? SMILEY_HEART_DEFAULT_PULSE, phase: placement.phase ?? ((heartIndex - 1) / heartCount)};
    });
}

// Objects with an animation's offsets added, matched by key (any shape)
export function applyObjectOffsets(objects: FaceObject[], offsets: Record<string, ObjectOffsets>): FaceObject[] {
    return objects.map((object: FaceObject): FaceObject => {
        const move = offsets[object.key];   // An animation moves only some objects
        if (move === undefined) return object;
        return {...object, x: object.x + (move.dx ?? 0), y: object.y + (move.dy ?? 0), angle: object.angle + (move.angle ?? 0), scale: object.scale + (move.scale ?? 0)};
    });
}


// --------------------------------------------------------------------------------
// Blending
// --------------------------------------------------------------------------------
// Move `t` of the way from one face's objects to another's: a match blends, and the rest fade out or in where they are
export function blendObjects(from: FaceObject[], to: FaceObject[], t: number): FaceObject[] {
    const leaving = from.filter((old: FaceObject) => !to.some((next: FaceObject) => sameObject(old, next))).map((old: FaceObject): FaceObject => ({...old, amount: old.amount * (1 - t)}));
    const staying = to.map((next: FaceObject): FaceObject => {
        const old = from.find((candidate: FaceObject) => sameObject(candidate, next));
        return (old === undefined) ? {...next, amount: next.amount * t} : mixObjects(old, next, t);
    });

    // A fully faded object drops out of the list
    return [...leaving, ...staying].filter((object: FaceObject) => object.amount > 0);
}

// Whether two objects are the same one in two faces (same key, and for hands the same shape)
function sameObject(a: FaceObject, b: FaceObject): boolean {
    if ((a.kind === "hand") && (b.kind === "hand")) return (a.key === b.key) && (a.shape === b.shape);
    return a.key === b.key;
}

// Every number of one object moved `t` of the way to the other (its key, kind, and shape come from `b`)
function mixObjects(a: FaceObject, b: FaceObject, t: number): FaceObject {
    const mix    = (from: number, to: number): number => from + ((to - from) * t);
    const placed = {amount: mix(a.amount, b.amount), x: mix(a.x, b.x), y: mix(a.y, b.y), angle: mix(a.angle, b.angle), scale: mix(a.scale, b.scale)};
    if ((a.kind === "heart") && (b.kind === "heart")) return {...b, ...placed, bob: mix(a.bob, b.bob), pulse: mix(a.pulse, b.pulse), phase: mix(a.phase, b.phase)};
    return {...b, ...placed};
}


// --------------------------------------------------------------------------------
// Object Offsets
// --------------------------------------------------------------------------------
// Two animations' object offsets added together (a field either one leaves out counts as zero)
export function sumObjectOffsets(a: Record<string, ObjectOffsets>, b: Record<string, ObjectOffsets>): Record<string, ObjectOffsets> {
    const sum = {...a};
    for (const [key, move] of Object.entries(b)) {
        const base = sum[key] ?? {};   // Only one of them may move this object
        sum[key] = {dx: (base.dx ?? 0) + (move.dx ?? 0), dy: (base.dy ?? 0) + (move.dy ?? 0), angle: (base.angle ?? 0) + (move.angle ?? 0), scale: (base.scale ?? 0) + (move.scale ?? 0)};
    }
    return sum;
}

// Object offsets scaled by one amount (0 leaves no offset, 1 keeps them as they are)
export function scaleObjectOffsets(offsets: Record<string, ObjectOffsets>, amount: number): Record<string, ObjectOffsets> {
    return Object.fromEntries(Object.entries(offsets).map(([key, move]: [string, ObjectOffsets]) => [key, {dx: (move.dx ?? 0) * amount, dy: (move.dy ?? 0) * amount, angle: (move.angle ?? 0) * amount, scale: (move.scale ?? 0) * amount}]));
}

// Object offsets flipped left to right: each object moves and turns the other way, and a hand's offsets go to the other hand
export function mirrorObjectOffsets(offsets: Record<string, ObjectOffsets>): Record<string, ObjectOffsets> {
    return Object.fromEntries(Object.entries(offsets).map(([key, move]: [string, ObjectOffsets]) => [otherSideKey(key), {...move, dx: -(move.dx ?? 0), angle: -(move.angle ?? 0)}]));
}

// The same object on the other side of the face (only hands have sides)
function otherSideKey(key: string): string {
    if (key === "hand-left")  return "hand-right";
    if (key === "hand-right") return "hand-left";
    return key;
}
