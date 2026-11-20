/* Draw both Map Task maps as one, with the avatar's path and what differs.
--------------------------------------------------------------------------------
`@frontend/src/components/map_task/CombinedMap`

Drawn on the participant's paper: their route, every landmark the two maps have
alike, and the path the avatar took on its own map. A landmark only one map has
is ringed in that map's color (green for the participant's, purple for the
avatar's), so one that sits somewhere else, or goes by another name, on the
avatar's map shows up twice, once in each color. A legend under the map says
what each line and ring means, worded for whoever is looking (`viewer`). Its
text takes the color of the page around it, so it fits the participant's chat
page and the admin pages alike.

*/
import type { ReactElement, ReactNode } from "react";
import      { useMemo                 } from "react";

// From this project
import type { MapPoint, MapTaskFollowerMap, MapTaskGiverMap } from "@/api";
import      { MAP_TASK_FOLLOWER_HEX, MAP_TASK_GIVER_HEX     } from "@/utils/styling/colors";
import      { MAP_TASK_PATH_HEX, MAP_TASK_ROUTE_HEX         } from "@/utils/styling/colors";
import        MapTaskMap                                      from "./MapTaskMap";
import type { CombinedLandmark                              } from "./mapTaskViews";
import      { combinedLandmarks                             } from "./mapTaskViews";

// Who looks at the map: the participant, or staff reviewing the chat
type MapViewer = "participant" | "staff";

// The legend's wording and type size for each viewer
const COMBINED_MAP_WORDS: Record<MapViewer, {label: string; route: string; onlyGiver: string; text: string}> = {
    participant : {label: "Your map, with the avatar's path drawn over it",              route: "Your route",              onlyGiver: "Only on your map",              text: "text-base"},
    staff       : {label: "The participant's map, with the avatar's path drawn over it", route: "The participant's route", onlyGiver: "Only on the participant's map", text: "text-xs"  },
};

// Each legend swatch's size, and its line and ring widths, in pixels
const MAP_LEGEND_SWATCH_PX = 16;
const MAP_LEGEND_LINE_W    = 3;
const MAP_LEGEND_RING_W    = 2;


// ================================================================================
// Combined Map
// ================================================================================
// The participant's map with the avatar's path and both maps' differences, then what each mark means
export default function CombinedMap({giver, follower, path, viewer, maxHeight = null}: {
    // The two maps, and where the avatar went
    giver    : MapTaskGiverMap;      // The participant's map, with the route
    follower : MapTaskFollowerMap;   // The avatar's map
    path     : MapPoint[];           // Every waypoint the avatar committed, from the start

    // How it is shown
    viewer     : MapViewer;          // Who is looking, for the legend's wording
    maxHeight? : string | null;      // Tallest the map may be drawn, as a CSS length (null fills the width)
}): ReactElement {
    const landmarks = useMemo((): CombinedLandmark[] => combinedLandmarks(giver, follower), [giver, follower]);
    const words     = COMBINED_MAP_WORDS[viewer];

    // A landmark drawn from both maps sits somewhere else, or goes by another name, on the avatar's
    const fromAvatar = new Set(landmarks.filter((landmark: CombinedLandmark) => landmark.side === "follower").map((landmark: CombinedLandmark) => landmark.id));
    const paired     = landmarks.some((landmark: CombinedLandmark) => (landmark.side === "giver") && fromAvatar.has(landmark.id));

    return (
        <div>
            <MapTaskMap
                label     = {words.label}
                landmarks = {landmarks}
                maxHeight = {maxHeight}
                path      = {path}
                route     = {giver.route}
                shape     = {giver.shape}
            />

            {/* What each line and ring means */}
            <div className={`mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 ${words.text}`}>
                <LegendItem swatch={<LineSwatch hex={MAP_TASK_ROUTE_HEX}    />}>{words.route}</LegendItem>
                <LegendItem swatch={<LineSwatch hex={MAP_TASK_PATH_HEX}     />}>The avatar's path</LegendItem>
                <LegendItem swatch={<RingSwatch hex={MAP_TASK_GIVER_HEX}    />}>{words.onlyGiver}</LegendItem>
                <LegendItem swatch={<RingSwatch hex={MAP_TASK_FOLLOWER_HEX} />}>Only on the avatar's map</LegendItem>
            </div>
            {paired ? <div className={`mt-2 opacity-80 ${words.text}`}>A landmark ringed in both colors is in a different place, or has a different name, on each map.</div> : null}
        </div>
    );
}


// --------------------------------------------------------------------------------
// Legend
// --------------------------------------------------------------------------------
// One mark and what it means
function LegendItem({swatch, children}: {swatch: ReactElement; children: ReactNode}): ReactElement {
    return <div className="flex items-center gap-2">{swatch}<span>{children}</span></div>;
}

// A line in one color (the route, or the avatar's path)
function LineSwatch({hex}: {hex: string}): ReactElement {
    const middle = MAP_LEGEND_SWATCH_PX / 2;
    return (
        <svg aria-hidden="true" width={MAP_LEGEND_SWATCH_PX} height={MAP_LEGEND_SWATCH_PX} className="shrink-0">
            <line x1={MAP_LEGEND_LINE_W} y1={middle} x2={MAP_LEGEND_SWATCH_PX - MAP_LEGEND_LINE_W} y2={middle} stroke={hex} strokeWidth={MAP_LEGEND_LINE_W} strokeLinecap="round" />
        </svg>
    );
}

// A ring in one map's color
function RingSwatch({hex}: {hex: string}): ReactElement {
    const middle = MAP_LEGEND_SWATCH_PX / 2;
    return (
        <svg aria-hidden="true" width={MAP_LEGEND_SWATCH_PX} height={MAP_LEGEND_SWATCH_PX} className="shrink-0">
            <circle cx={middle} cy={middle} r={middle - MAP_LEGEND_RING_W} fill="none" stroke={hex} strokeWidth={MAP_LEGEND_RING_W} />
        </svg>
    );
}
