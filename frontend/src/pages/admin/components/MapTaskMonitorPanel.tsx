/* The Map Task's live view on the admin page: both maps and the avatar's path.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/MapTaskMonitorPanel`

Shown in the live chat page's side column for a Map Task chat, from the
listener's `task_monitor` frames. The avatar's map shows where it has been after
each saved reply, with the participant's route drawn faintly over it, so whoever
monitors the chat can see whether it is following. The participant's own map is
under it, and the landmarks that differ between the two are ringed on both.

*/
import type { ReactElement } from "react";
import      { useMemo      } from "react";

// From this project
import        MapDifferencesList                      from "@/components/map_task/MapDifferencesList";
import        MapTaskMap                              from "@/components/map_task/MapTaskMap";
import      { differingIds, mapDifferences          } from "@/components/map_task/mapTaskViews";
import type { MapTaskMonitor                        } from "@/hooks/chat-listener/data_utils/taskMonitor";
import      { MAP_TASK_PATH_HEX, MAP_TASK_ROUTE_HEX } from "@/utils/styling/colors";

// Each map's card, and the small heading over it
const MONITOR_CARD    = "rounded-xl border border-admin-border bg-admin-panel p-3 shadow-sm";
const MONITOR_HEADING = "mb-2 flex items-baseline justify-between gap-2 text-sm font-semibold text-admin-text";


// ================================================================================
// Map Task Monitor Panel
// ================================================================================
// The avatar's map with its path, the participant's map with the route, and what differs between them
export function MapTaskMonitorPanel({view}: {
    view : MapTaskMonitor;  // The latest view from the backend
}): ReactElement {
    // What differs between the maps (the maps never change during a chat, only the path does)
    const differences = useMemo(() => mapDifferences(view.giver, view.follower), [view.giver, view.follower]);
    const ringed      = useMemo(() => differingIds(differences), [differences]);
    const segments    = view.path.length - 1;

    return (
        <div className="flex flex-col gap-3">
            {/* The avatar's map, where it has been, and the route it should follow */}
            <section className={MONITOR_CARD}>
                <div className={MONITOR_HEADING}>
                    The avatar's map
                    <span className="text-xs font-normal text-admin-subtext">{(segments === 1) ? "1 path segment" : `${segments} path segments`}</span>
                </div>
                <MapTaskMap
                    ghostRoute = {view.giver.route}
                    label      = "The avatar's map, with where it has been and the participant's route"
                    landmarks  = {view.follower.landmarks}
                    marked     = {ringed}
                    path       = {view.path}
                    shape      = {view.follower.shape}
                    start      = {view.follower.start}
                />
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-admin-subtext">
                    <span>Shaded areas show landmark size.</span>
                    <span><span className="inline-block h-0.5 w-5 rounded align-middle"                   style={{backgroundColor: MAP_TASK_PATH_HEX }} /> Where the avatar has been</span>
                    <span><span className="inline-block w-5 border-t-2 border-dashed align-middle opacity-60" style={{borderColor:     MAP_TASK_ROUTE_HEX}} /> The participant's route</span>
                </div>
            </section>

            {/* The participant's map */}
            <section className={MONITOR_CARD}>
                <div className={MONITOR_HEADING}>The participant's map</div>
                <MapTaskMap shape={view.giver.shape} landmarks={view.giver.landmarks} route={view.giver.route} marked={ringed} label="The participant's map, with the route" />
            </section>

            {/* What differs (ringed on both maps) */}
            <section className={MONITOR_CARD}>
                <div className={MONITOR_HEADING}>What differs</div>
                <MapDifferencesList differences={differences} />
            </section>
        </div>
    );
}
