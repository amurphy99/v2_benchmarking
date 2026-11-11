/* Staff preview of the Map Task map files: both maps of each, or why it doesn't load.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/AdminMapTaskMaps`

Maps are written by hand as JSON files in
`backend/chat_app/websocket/harnesses/map_task/maps/` (the format is in that
folder's README). The backend reads every file fresh for this page, so after
saving a file, switching back to the browser (or the Reload button) shows the
edit without restarting anything. Staff only: it shows the avatar's map.

*/
import type { ReactElement } from "react";
import      { LuRefreshCw  } from "react-icons/lu";

// From this project
import type { MapTaskMapFile  } from "@/api";
import      { useMapTaskMaps  } from "@/hooks/queries/useMapTaskMaps";
import      { MapTaskFileCard } from "./components/MapTaskFileCard";
import      { AdminButton     } from "./components/ui/AdminButton";
import      { AdminPage       } from "./components/ui/AdminPage";
import      { AdminPageHeader } from "./components/ui/AdminPageHeader";


// ================================================================================
// Admin Map Task Maps
// ================================================================================
// Every map file, the ones clients can pick first
export function AdminMapTaskMaps(): ReactElement {
    const {data: files, isLoading, refresh} = useMapTaskMaps();

    return (
        <AdminPage contained={false}>
            <AdminPageHeader
                title    = "Map Task Maps"
                subtitle = "The participant's and the avatar's version of each map, with what differs between them."
                actions  = {<AdminButton variant="outline" size="sm" iconLeft={<LuRefreshCw size={14} />} onClick={() => refresh()}>Reload</AdminButton>}
            />

            <div className="mx-auto max-w-[1400px] px-4 md:px-6 pt-6 flex flex-col gap-6">
                {/* Every map */}
                {isLoading ? (
                    <p className="text-sm text-admin-subtext">Loading maps...</p>
                ) : (files.length === 0) ? (
                    <p className="text-sm text-admin-subtext">There are no maps yet.</p>
                ) : (
                    files.map((file: MapTaskMapFile) => <MapTaskFileCard key={file.variant} file={file} />)
                )}
            </div>
        </AdminPage>
    );
}
