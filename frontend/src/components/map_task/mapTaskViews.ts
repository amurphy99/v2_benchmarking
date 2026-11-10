/* Check the Map Task maps a WebSocket frame carries, and compare the two maps.
--------------------------------------------------------------------------------
`@frontend/src/components/map_task/mapTaskViews`

The participant's map arrives in a `task_card` frame, and both maps in the admin
listener's `task_monitor` frame, in the shapes `giver_view` and `follower_view`
build (`backend/chat_app/websocket/harnesses/map_task/maps.py`). Each check
returns null for anything off that shape, including an icon this client has no
picture for, so a frame's router can drop it whole.

The comparison lists what makes the two maps differ (the landmarks only one of
them has, and the ones moved or renamed on the avatar's), for the admin view and
the staff preview to ring and name.

*/
// From this project
import type { MapPoint, MapShape, MapTaskFollowerMap, MapTaskGiverMap, MapTaskLandmark } from "@/api";
import      { MAP_TASK_ICONS                                                          } from "./mapTaskIcons";

// Each paper shape's width and height, in drawing units (copied from `MAP_TASK_PAPER` in the backend's `maps.py`)
export const MAP_TASK_PAPER: Record<MapShape, [number, number]> = {
    landscape : [210, 148],
    portrait  : [148, 210],
};


// --------------------------------------------------------------------------------
// Map Checks
// --------------------------------------------------------------------------------
// The participant's map: {shape, landmarks, route} with a start and a finish (null when malformed)
export function parseGiverMap(value: unknown): MapTaskGiverMap | null {
    if (!isRecord(value)) return null;
    const shape     = readShape(value.shape);
    const landmarks = readLandmarks(value.landmarks);
    const route     = readPoints(value.route);
    if ((shape === null) || (landmarks === null) || (route === null) || (route.length < 2)) return null;
    return {shape, landmarks, route};
}

// The avatar's map: {shape, landmarks, start} (null when malformed)
export function parseFollowerMap(value: unknown): MapTaskFollowerMap | null {
    if (!isRecord(value)) return null;
    const shape     = readShape(value.shape);
    const landmarks = readLandmarks(value.landmarks);
    const start     = readPoint(value.start);
    if ((shape === null) || (landmarks === null) || (start === null)) return null;
    return {shape, landmarks, start};
}

// A list of points (null when any is malformed)
export function readPoints(value: unknown): MapPoint[] | null {
    if (!Array.isArray(value)) return null;
    const points = value.map(readPoint);
    return points.every((point: MapPoint | null): point is MapPoint => point !== null) ? points : null;
}

// A point [x, y] with both from 0 to 1 (null when malformed)
export function readPoint(value: unknown): MapPoint | null {
    if (!Array.isArray(value) || (value.length !== 2)) return null;
    const [x, y] = value;
    return (isFraction(x) && isFraction(y)) ? [x, y] : null;
}


// --------------------------------------------------------------------------------
// Comparing the Two Maps
// --------------------------------------------------------------------------------
// How the avatar's map differs from the participant's
export type MapDifferences = {
    onlyGiver    : MapTaskLandmark[];   // Only on the participant's map
    onlyFollower : MapTaskLandmark[];   // Only on the avatar's map
    moved        : MapTaskLandmark[];   // On both, somewhere else on the avatar's (the avatar's copy)
    renamed      : MapTaskLandmark[];   // On both, called something else on the avatar's (the avatar's copy)
};

// What makes the two maps differ, landmark by landmark
export function mapDifferences(giver: MapTaskGiverMap, follower: MapTaskFollowerMap): MapDifferences {
    const giverById    = new Map(giver   .landmarks.map((landmark: MapTaskLandmark) => [landmark.id, landmark]));
    const followerById = new Map(follower.landmarks.map((landmark: MapTaskLandmark) => [landmark.id, landmark]));

    // Each landmark on both maps, as [the avatar's copy, the participant's copy]
    const pairs = follower.landmarks.flatMap((mine: MapTaskLandmark): [MapTaskLandmark, MapTaskLandmark][] => {
        const theirs = giverById.get(mine.id);
        return (theirs === undefined) ? [] : [[mine, theirs]];
    });
    return {
        onlyGiver    : giver   .landmarks.filter((landmark: MapTaskLandmark) => !followerById.has(landmark.id)),
        onlyFollower : follower.landmarks.filter((landmark: MapTaskLandmark) => !giverById   .has(landmark.id)),
        moved        : pairs.filter(([mine, theirs]) => !samePoint(mine.at, theirs.at)).map(([mine]) => mine),
        renamed      : pairs.filter(([mine, theirs]) => mine.label !== theirs.label   ).map(([mine]) => mine),
    };
}

// Every landmark id that differs between the maps (to ring on either one)
export function differingIds(differences: MapDifferences): Set<string> {
    const {onlyGiver, onlyFollower, moved, renamed} = differences;
    return new Set([...onlyGiver, ...onlyFollower, ...moved, ...renamed].map((landmark: MapTaskLandmark) => landmark.id));
}

// Two points in the same place
function samePoint(a: MapPoint, b: MapPoint): boolean {
    return (a[0] === b[0]) && (a[1] === b[1]);
}


// --------------------------------------------------------------------------------
// Field Checks
// --------------------------------------------------------------------------------
// The paper's shape (null when it isn't one this client can draw)
function readShape(value: unknown): MapShape | null {
    return ((value === "landscape") || (value === "portrait")) ? value : null;
}

// Every landmark on a map (null when any is malformed)
function readLandmarks(value: unknown): MapTaskLandmark[] | null {
    if (!Array.isArray(value)) return null;
    const landmarks = value.map(readLandmark);
    return landmarks.every((landmark: MapTaskLandmark | null): landmark is MapTaskLandmark => landmark !== null) ? landmarks : null;
}

// One landmark: {id, label, icon, at, radius}, with an icon this client can draw
function readLandmark(value: unknown): MapTaskLandmark | null {
    if (!isRecord(value)) return null;
    const {id, label, icon, radius} = value;
    const at = readPoint(value.at);
    if ((typeof id !== "string") || (typeof label !== "string") || (typeof icon !== "string") || !Object.hasOwn(MAP_TASK_ICONS, icon)) return null;
    if ((at === null) || (typeof radius !== "number") || !(radius > 0)) return null;
    return {id, label, icon, at, radius};
}

// A number from 0 to 1
function isFraction(value: unknown): value is number {
    return (typeof value === "number") && (value >= 0) && (value <= 1);
}

// A plain JSON object
export function isRecord(value: unknown): value is Record<string, unknown> {
    return (typeof value === "object") && (value !== null) && !Array.isArray(value);
}
