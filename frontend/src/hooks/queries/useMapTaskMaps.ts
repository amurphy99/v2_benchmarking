/* Query hook for the staff preview of the Map Task map files.
--------------------------------------------------------------------------------
`@frontend/src/hooks/queries/useMapTaskMaps`

Never served from cache, and fetched again whenever the page regains focus, so
saving a map file and switching back to the browser shows the edit.

*/
// From this project
import type { MapTaskMapFile  } from "@/api";
import      { listMapTaskMaps } from "@/api";
import      { useModelQuery   } from "./common";


// Every Map Task map file, read fresh from disk (staff only)
export function useMapTaskMaps(): ReturnType<typeof useModelQuery<MapTaskMapFile[]>> {
    return useModelQuery<MapTaskMapFile[]>({
        queryKey             : "mapTaskMaps",
        queryFn              : listMapTaskMaps,
        empty                : [],
        staleTime            : 0,
        refetchOnWindowFocus : true,
    });
}
