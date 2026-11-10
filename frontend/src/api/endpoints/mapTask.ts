/* REST call for the staff preview of the Map Task map files.
--------------------------------------------------------------------------------
`@frontend/src/api/endpoints/mapTask`

Staff only: the backend refuses it for anyone without `is_staff`, because it
shows the avatar's map too.

*/
// From this project
import      { request        } from "../client";
import type { MapTaskMapFile } from "../models";


// Every Map Task map file, read fresh from disk: both maps from each, or why it doesn't load
export const listMapTaskMaps = (): Promise<MapTaskMapFile[]> => request<MapTaskMapFile[]>("/map-task/maps/");
