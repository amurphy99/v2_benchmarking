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
                subtitle = "Both maps of every map file, as the chats will use them."
                actions  = {<AdminButton variant="outline" size="sm" iconLeft={<LuRefreshCw size={14} />} onClick={() => refresh()}>Reload</AdminButton>}
            />

            <div className="mx-auto max-w-[1400px] px-4 md:px-6 pt-6 flex flex-col gap-6">
                {/* How a map gets here, and onto the chat page */}
                <p className="text-sm text-admin-subtext">
                    Each map is a file in <code>backend/chat_app/websocket/harnesses/map_task/maps/</code>. Save a file and come back to this tab to see it.
                    The chat page offers a map once its name is in <code>MAP_TASK_VARIANTS</code> (in that folder's <code>harness.py</code>) and in <code>frontend/src/pages/chat/chatModes.ts</code>.
                </p>

                {/* Every file */}
                {isLoading ? (
                    <p className="text-sm text-admin-subtext">Loading the map files...</p>
                ) : (files.length === 0) ? (
                    <p className="text-sm text-admin-subtext">There are no map files yet.</p>
                ) : (
                    files.map((file: MapTaskMapFile) => <MapTaskFileCard key={file.variant} file={file} />)
                )}
            </div>
        </AdminPage>
    );
}
