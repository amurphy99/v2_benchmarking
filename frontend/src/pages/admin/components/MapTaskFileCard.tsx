/* One Map Task map file on the staff preview page: both maps, or why it doesn't load.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/MapTaskFileCard`

Shows a file the way the chats will use it: the participant's map with its
route, the avatar's map with its start, and what differs between them (ringed on
both). A file that doesn't load shows the error that would stop the backend
starting, and a map not offered in chats yet says so.

*/
import type { ReactElement } from "react";

// From this project
import type { MapTaskMapFile               } from "@/api";
import        MapDifferencesList             from "@/components/map_task/MapDifferencesList";
import        MapTaskMap                     from "@/components/map_task/MapTaskMap";
import      { differingIds, mapDifferences } from "@/components/map_task/mapTaskViews";
import      { chatRunLabel                 } from "./chat_lists/chatTypePresentation";
import      { Pill                         } from "./ui/Pill";

// Each map's heading
const MAP_FILE_HEADING = "mb-2 text-sm font-semibold text-admin-text";

// Tallest each map is drawn, so a tall pair fits on screen side by side
const MAP_FILE_MAX_HEIGHT = "75vh";


// --------------------------------------------------------------------------------
// Map Task File Card
// --------------------------------------------------------------------------------
// The file's name and status, then its two maps side by side (or its error)
export function MapTaskFileCard({file}: {
    file : MapTaskMapFile;  // One file from the backend's preview
}): ReactElement {
    const {giver, follower} = file;
    const differences       = ((giver !== null) && (follower !== null)) ? mapDifferences(giver, follower) : null;

    return (
        <section className="rounded-xl border border-admin-border bg-admin-panel shadow-sm">
            {/* Name, whether chats offer it, and whether it loads */}
            <header className="flex flex-wrap items-center gap-3 border-b border-admin-border px-4 py-3">
                <h2 className="text-lg font-semibold text-admin-text first-letter:uppercase">{chatRunLabel(file.variant)}</h2>
                <Pill variant={file.registered ? "live" : "paused"} value={file.registered ? "Available in chats" : "Not offered in chats yet"} />
                {(file.error !== null) ? <Pill variant="severity-severe" value="Doesn't load" /> : null}
            </header>

            <div className="flex flex-col gap-4 p-4">
                {/* Why it doesn't load (the same error would stop the backend starting) */}
                {(file.error !== null) ? <pre className="whitespace-pre-wrap rounded-lg bg-red-50 p-3 text-sm text-red-800">{file.error}</pre> : null}

                {/* Both maps, and what differs between them */}
                {((giver !== null) && (follower !== null) && (differences !== null)) ? (
                    <>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <div className={MAP_FILE_HEADING}>The participant's map</div>
                                <MapTaskMap shape={giver.shape} landmarks={giver.landmarks} route={giver.route} marked={differingIds(differences)} maxHeight={MAP_FILE_MAX_HEIGHT} label={`${file.variant}: the participant's map`} />
                            </div>
                            <div>
                                <div className={MAP_FILE_HEADING}>The avatar's map</div>
                                <MapTaskMap shape={follower.shape} landmarks={follower.landmarks} start={follower.start} marked={differingIds(differences)} maxHeight={MAP_FILE_MAX_HEIGHT} label={`${file.variant}: the avatar's map`} />
                            </div>
                        </div>
                        <MapDifferencesList differences={differences} />
                    </>
                ) : null}
            </div>
        </section>
    );
}
