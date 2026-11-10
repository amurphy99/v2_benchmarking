/* The chat type's task panel view (`task_monitor`), checked where the frame arrives.
--------------------------------------------------------------------------------
`@frontend/src/hooks/chat-listener/data_utils/taskMonitor`

A chat type with state worth watching sends the admin listener a view of it as
the listener joins and after each saved reply that changes it (`monitor_view` in
`backend/chat_app/websocket/harnesses/base.py`). Each view replaces the last.
`kind` says which chat type's view it is: this page shows `map_task` views, and
drops any other kind, or a view that doesn't match its shape. Field names keep
the wire's spelling.

*/
// From this project
import type { MapPoint, MapTaskFollowerMap, MapTaskGiverMap                     } from "@/api";
import      { isRecord, parseFollowerMap, parseGiverMap, readPoint, readPoints } from "@/components/map_task/mapTaskViews";

// The Map Task's view: both maps, where the avatar is, and every committed waypoint
export type MapTaskMonitor = {
    kind     : "map_task";
    giver    : MapTaskGiverMap;      // The participant's map, with the route
    follower : MapTaskFollowerMap;   // The avatar's own map
    position : MapPoint;             // Where the avatar is now
    path     : MapPoint[];           // Every committed waypoint, from the start
};

// Every kind of view this page can show
export type TaskMonitor = MapTaskMonitor;


// --------------------------------------------------------------------------------
// Parse a Task Monitor View
// --------------------------------------------------------------------------------
// A `task_monitor` frame's data as a view (null for a kind this page can't show, or a malformed view)
export function parseTaskMonitor(data: unknown): TaskMonitor | null {
    if (!isRecord(data) || (data.kind !== "map_task")) return null;
    const giver    = parseGiverMap   (data.giver   );
    const follower = parseFollowerMap(data.follower);
    const position = readPoint       (data.position);
    const path     = readPoints      (data.path    );
    if ((giver === null) || (follower === null) || (position === null) || (path === null) || (path.length === 0)) return null;
    return {kind: "map_task", giver, follower, position, path};
}
