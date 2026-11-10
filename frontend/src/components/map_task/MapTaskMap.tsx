/* Draw one Map Task map: its landmarks, and the route or the avatar's path.
--------------------------------------------------------------------------------
`@frontend/src/components/map_task/MapTaskMap`

The participant's map shows its landmarks and the route from the start to the
finish; the avatar's map shows its own landmarks and the start. A monitor adds
where the avatar has been (and the participant's route, faintly, to compare
against), and the staff preview rings the landmarks that differ between the two
maps. Points are 0-1 across and down the map, the frame the map files use, drawn
on wide or tall paper (`shape`). Landmarks are drawn as large as they reach
(`radius`, in lengths of the paper's longer side), so a lake is bigger than a
bus. A tall map can be kept on screen with `maxHeight`; it then narrows to keep
its proportions and centers itself.

*/
import type { CSSProperties, ReactElement } from "react";
import      { useId                       } from "react";

// From this project
import type { MapPoint, MapShape, MapTaskLandmark    } from "@/api";
import      { MAP_TASK_PATH_HEX, MAP_TASK_ROUTE_HEX } from "@/utils/styling/colors";
import      { MAP_TASK_FINISH_ICON, MAP_TASK_ICONS   } from "./mapTaskIcons";
import      { MAP_TASK_PAPER                         } from "./mapTaskViews";

// Room left around the paper for labels near its edges, in drawing units
const MAP_VIEW_MARGIN = 8;

// Symbols sit inside the footprint; only the footprint represents physical extent
const MAP_ICON_SCALE = 1.4;
const MAP_ICON_MIN   = 8;
const MAP_ICON_MAX   = 24;

// Text and line sizes, in drawing units
const MAP_LABEL_SIZE   = 6;
const MAP_ROUTE_W      = 2.2;
const MAP_PATH_W       = 1.8;
const MAP_MARKER_R     = 3;
const MAP_STOP_R       = 1.4;
const MAP_RING_PADDING = 2.5;
const MAP_LABEL_CHARS  = 18;
const MAP_LABEL_GAP    = 1.2;
const MAP_LABEL_INSET  = 3;
const MAP_LABEL_CHAR_W = MAP_LABEL_SIZE * 0.55;
const MAP_FOOTPRINT_W  = 0.6;
const MAP_MARKER_CLEAR_W   = 24;
const MAP_MARKER_CLEAR_H   = 26;
const MAP_MARKER_CLEAR_TOP = 16;

// Quiet terrain colors distinguish regions from the route and its markers
const MAP_WATER_ICONS = new Set(["lake", "river", "waterfall", "swamp", "rapids", "fountain", "well", "dam"]);
const MAP_GREEN_ICONS = new Set(["tree", "forest", "pine_tree", "palm_tree", "bush", "grass", "wheat", "field", "orchard"]);
const MAP_TERRAIN_COLORS = {
    water : {fill: "#deedf1", edge: "#6b98a5"},
    green : {fill: "#e5ecd9", edge: "#8a9c70"},
    land  : {fill: "#eee5d5", edge: "#b5a48b"},
};

// Colors (paper and ink like the avatar's held map; the route and path colors are shared with legends)
const MAP_PAPER_HEX = "#fbf5e6";
const MAP_EDGE_HEX  = "#b8a27a";
const MAP_INK_HEX   = "#4b3f2f";
const MAP_RING_HEX  = "#b45309";

// How faint the participant's route is when drawn on the avatar's map for comparison
const MAP_GHOST_OPACITY = 0.45;

// The paper's width and height, in drawing units
type Paper = [number, number];

// A label's baseline and wrapped lines, placed to avoid neighboring symbols and names
type MapLabel = {x: number; y: number; lines: string[]};


// ================================================================================
// Map Task Map
// ================================================================================
// One map as an SVG that fills its container's width (or a set height, for a tall map)
export default function MapTaskMap({shape, landmarks, label, route = null, start = null, ghostRoute = null, path = null, marked = null, maxHeight = null}: {
    // What is on the map
    shape     : MapShape;            // Its paper: wide or tall
    landmarks : MapTaskLandmark[];   // Every landmark on this map
    label     : string;              // What the picture shows, for screen readers
    route?    : MapPoint[] | null;   // The route from the start to the finish (the participant's map)
    start?    : MapPoint | null;     // Just the start (the avatar's map, which has no route)

    // What a monitor adds
    ghostRoute? : MapPoint[] | null;   // The participant's route, drawn faintly to compare against
    path?       : MapPoint[] | null;   // Every committed waypoint, ending where the avatar is

    // What the preview adds
    marked? : ReadonlySet<string> | null;   // Landmark ids to ring (the ones that differ between the two maps)

    // Sizing
    maxHeight? : string | null;   // Tallest the map may be drawn, as a CSS length ("70vh"; null fills the width)
}): ReactElement {
    // The paper and the view around it, and the start: the route's first point, or the one given
    const paper           = MAP_TASK_PAPER[shape];
    const [width, height] = [paper[0] + (2 * MAP_VIEW_MARGIN), paper[1] + (2 * MAP_VIEW_MARGIN)];
    const startAt         = (route !== null) ? route[0] : start;
    const clipId          = `map-paper-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
    const markers         = [...((startAt === null) ? [] : [startAt]), ...((route === null) ? [] : [route[route.length - 1]])];
    const labels          = placeLabels(landmarks, paper, markers);

    // A height limit narrows the map to keep its proportions
    const sizing: CSSProperties | undefined = (maxHeight === null) ? undefined : {maxHeight, maxWidth: `calc(${maxHeight} * ${(width / height).toFixed(4)})`};

    return (
        <svg
            viewBox    = {`${-MAP_VIEW_MARGIN} ${-MAP_VIEW_MARGIN} ${width} ${height}`}
            className  = "block mx-auto w-full h-auto select-none"
            style      = {sizing}
            role       = "img"
            aria-label = {label}
        >
            {/* Paper */}
            <rect x={0} y={0} width={paper[0]} height={paper[1]} rx={3} fill={MAP_PAPER_HEX} stroke={MAP_EDGE_HEX} strokeWidth={1} />
            <defs>
                <clipPath id={clipId}><rect width={paper[0]} height={paper[1]} rx={3} /></clipPath>
            </defs>

            {/* Footprints use exactly the radius used by the follower's geometry */}
            <g clipPath={`url(#${clipId})`}>
                {landmarks.map((landmark: MapTaskLandmark) => drawFootprint(landmark, paper))}
            </g>

            {/* The participant's route, faintly, under everything else */}
            {(ghostRoute !== null) ? (
                <path d={routePath(ghostRoute, paper)} fill="none" stroke={MAP_TASK_ROUTE_HEX} strokeWidth={MAP_ROUTE_W * 0.7} strokeDasharray="4 3" strokeLinecap="round" opacity={MAP_GHOST_OPACITY} />
            ) : null}

            {/* The route, with its finish */}
            {(route !== null) ? (
                <g>
                    <path d={routePath(route, paper)} fill="none" stroke={MAP_TASK_ROUTE_HEX} strokeWidth={MAP_ROUTE_W} strokeLinecap="round" strokeLinejoin="round" />
                    {drawFinish(route[route.length - 1], paper)}
                </g>
            ) : null}

            {/* Symbols and labels stay legible over the route */}
            {landmarks.map((landmark: MapTaskLandmark, index: number) => drawLandmark(landmark, paper, marked?.has(landmark.id) === true, labels[index]))}

            {/* The start */}
            {(startAt !== null) ? drawStart(startAt, paper) : null}

            {/* Where the avatar has been, and where it is */}
            {((path !== null) && (path.length > 0)) ? drawAvatarPath(path, paper) : null}
        </svg>
    );
}


// --------------------------------------------------------------------------------
// Map Marks
// --------------------------------------------------------------------------------
// Draw the landmark's region at its true radius, without symbol size limits
function drawFootprint(landmark: MapTaskLandmark, paper: Paper): ReactElement {
    const [x, y] = toView(landmark.at, paper);
    const radius = landmark.radius * Math.max(...paper);
    const colors = MAP_WATER_ICONS.has(landmark.icon) ? MAP_TERRAIN_COLORS.water : (MAP_GREEN_ICONS.has(landmark.icon) ? MAP_TERRAIN_COLORS.green : MAP_TERRAIN_COLORS.land);
    return <circle key={landmark.id} cx={x} cy={y} r={radius} fill={colors.fill} stroke={colors.edge} strokeWidth={MAP_FOOTPRINT_W} />;
}

// Draw a bounded symbol, wrapped name, and a difference ring outside the actual footprint
function drawLandmark(
    landmark : MapTaskLandmark,  // The landmark and its radius
    paper    : Paper,            // Paper dimensions in drawing units
    ringed   : boolean,          // Whether this landmark differs between maps
    label    : MapLabel,         // Its placed name
): ReactElement {
    const Icon   = MAP_TASK_ICONS[landmark.icon];
    const [x, y] = toView(landmark.at, paper);
    const size   = Math.min(MAP_ICON_MAX, Math.max(MAP_ICON_MIN, landmark.radius * Math.max(...paper) * MAP_ICON_SCALE));
    const radius = landmark.radius * Math.max(...paper);
    const lineH  = MAP_LABEL_SIZE * MAP_LABEL_GAP;
    return (
        <g key={landmark.id}>
            <title>{`${landmark.label}: shaded area shows its extent`}</title>
            {ringed ? <circle cx={x} cy={y} r={radius + MAP_RING_PADDING} fill="none" stroke={MAP_RING_HEX} strokeWidth={1.2} strokeDasharray="3 2" /> : null}
            <Icon x={x - (size / 2)} y={y - (size / 2)} size={size} color={MAP_INK_HEX} />
            {label.lines.map((line: string, index: number) => <g key={index}>{drawText(label.x, label.y + (index * lineH), line, MAP_INK_HEX, false)}</g>)}
        </g>
    );
}


// --------------------------------------------------------------------------------
// Label Placement
// --------------------------------------------------------------------------------
// Pick the least crowded of four label positions, keeping each name within the paper
function placeLabels(landmarks: MapTaskLandmark[], paper: Paper, markers: MapPoint[]): MapLabel[] {
    const lineH = MAP_LABEL_SIZE * MAP_LABEL_GAP;
    const boxes = landmarks.map((landmark: MapTaskLandmark) => {
        const [x, y] = toView(landmark.at, paper);
        const half   = Math.min(MAP_ICON_MAX, Math.max(MAP_ICON_MIN, landmark.radius * Math.max(...paper) * MAP_ICON_SCALE)) / 2;
        return {x: x - half, y: y - half, w: half * 2, h: half * 2};
    });
    for (const marker of markers) {
        const [x, y] = toView(marker, paper);
        boxes.push({x: x - (MAP_MARKER_CLEAR_W / 2), y: y - MAP_MARKER_CLEAR_TOP, w: MAP_MARKER_CLEAR_W, h: MAP_MARKER_CLEAR_H});
    }
    return landmarks.map((landmark: MapTaskLandmark, index: number): MapLabel => {
        const lines  = labelLines(landmark.label);
        const w      = Math.max(...lines.map((line: string) => line.length)) * MAP_LABEL_CHAR_W;
        const h      = lines.length * lineH;
        const symbol = boxes[index];
        const [x, y] = toView(landmark.at, paper);
        const options = [
            {x: x - (w / 2), y: symbol.y + symbol.h + MAP_LABEL_INSET},
            {x: x - (w / 2), y: symbol.y - h - MAP_LABEL_INSET},
            {x: symbol.x + symbol.w + MAP_LABEL_INSET, y: y - (h / 2)},
            {x: symbol.x - w - MAP_LABEL_INSET, y: y - (h / 2)},
        ].map((point: {x: number; y: number}) => {
            const candidate = {x: Math.max(MAP_LABEL_INSET, Math.min(paper[0] - w - MAP_LABEL_INSET, point.x)), y: Math.max(MAP_LABEL_INSET, Math.min(paper[1] - h - MAP_LABEL_INSET, point.y)), w, h};
            const overlap   = boxes.reduce((area: number, box: {x: number; y: number; w: number; h: number}) => area + Math.max(0, Math.min(candidate.x + w, box.x + box.w) - Math.max(candidate.x, box.x)) * Math.max(0, Math.min(candidate.y + h, box.y + box.h) - Math.max(candidate.y, box.y)), 0);
            return {...candidate, overlap};
        });
        options.sort((a: {overlap: number}, b: {overlap: number}): number => a.overlap - b.overlap);
        const chosen = options[0];
        boxes.push(chosen);
        return {x: chosen.x + (w / 2), y: chosen.y + MAP_LABEL_SIZE, lines};
    });
}

// Wrap names at word boundaries so long labels do not span neighboring landmarks
function labelLines(label: string): string[] {
    const lines: string[] = [""];
    for (const word of label.split(" ")) {
        const index = lines.length - 1;
        if ((lines[index].length > 0) && (lines[index].length + word.length + 1 > MAP_LABEL_CHARS)) lines.push(word);
        else lines[index] += `${lines[index] ? " " : ""}${word}`;
    }
    return lines;
}

// The start: a ringed dot, and its label above it
function drawStart(at: MapPoint, paper: Paper): ReactElement {
    const [x, y] = toView(at, paper);
    return (
        <g>
            <circle cx={x} cy={y} r={MAP_MARKER_R + 1.5} fill="none" stroke={MAP_TASK_ROUTE_HEX} strokeWidth={1} />
            <circle cx={x} cy={y} r={MAP_MARKER_R - 0.5} fill={MAP_TASK_ROUTE_HEX} />
            {drawText(x, y - MAP_MARKER_R - 3, "Start", MAP_TASK_ROUTE_HEX, true)}
        </g>
    );
}

// The finish: a checkered flag, and its label under it
function drawFinish(at: MapPoint, paper: Paper): ReactElement {
    const FinishIcon = MAP_TASK_FINISH_ICON;
    const [x, y]     = toView(at, paper);
    const size       = MAP_ICON_MIN + 2;
    return (
        <g>
            <FinishIcon x={x - 2} y={y - size} size={size} color={MAP_TASK_ROUTE_HEX} />
            {drawText(x, y + MAP_LABEL_SIZE + 1, "Finish", MAP_TASK_ROUTE_HEX, true)}
        </g>
    );
}

// Where the avatar has been: a line through every stop, and a marker where it is now
function drawAvatarPath(path: MapPoint[], paper: Paper): ReactElement {
    const points = path.map((point: MapPoint) => toView(point, paper));
    const [x, y] = points[points.length - 1];
    return (
        <g>
            <polyline points={points.map((point: [number, number]) => point.join(",")).join(" ")} fill="none" stroke={MAP_TASK_PATH_HEX} strokeWidth={MAP_PATH_W} strokeLinecap="round" strokeLinejoin="round" />
            {points.slice(0, -1).map(([stopX, stopY]: [number, number], index: number) => <circle key={index} cx={stopX} cy={stopY} r={MAP_STOP_R} fill={MAP_TASK_PATH_HEX} />)}
            <circle cx={x} cy={y} r={MAP_MARKER_R + 1} fill={MAP_TASK_PATH_HEX} stroke="#ffffff" strokeWidth={1.2} />
        </g>
    );
}

// A label on the map, with a paper-colored halo so it reads over the route and other marks
function drawText(x: number, y: number, text: string, color: string, bold: boolean): ReactElement {
    return (
        <text
            x              = {x}
            y              = {y}
            fontSize       = {MAP_LABEL_SIZE}
            fontWeight     = {bold ? 700 : 500}
            textAnchor     = "middle"
            fill           = {color}
            stroke         = {MAP_PAPER_HEX}
            strokeWidth    = {2}
            paintOrder     = "stroke"
            strokeLinejoin = "round"
        >
            {text}
        </text>
    );
}


// --------------------------------------------------------------------------------
// Geometry
// --------------------------------------------------------------------------------
// A map point in drawing units
function toView([x, y]: MapPoint, paper: Paper): [number, number] {
    return [x * paper[0], y * paper[1]];
}

// Join the recorded points exactly; smoothing would invent geometry between them
function routePath(route: MapPoint[], paper: Paper): string {
    return route.map((point: MapPoint, index: number) => `${index === 0 ? "M" : "L"} ${toView(point, paper).join(" ")}`).join(" ");
}
