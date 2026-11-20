/* The participant's Map Task map beside the avatar, and both maps once it ends.
--------------------------------------------------------------------------------
`@frontend/src/pages/chat/components/MapTaskMapPanel`

Drawn from the backend's `task_card` frame when the chat starts: the
participant's landmarks and the route from the start to the finish, which they
describe so the avatar can follow it on its own map. The avatar's map is a
little different, and the participant sees it only once the chat ends: the
backend's `task_reveal` then turns the panel into both maps drawn as one, with
the path the avatar took and the landmarks the maps don't share
(`CombinedMap`).

*/
import type { ReactElement } from "react";
import      { BsMap        } from "react-icons/bs";

// From this project
import        CombinedMap      from "@/components/map_task/CombinedMap";
import        MapTaskMap       from "@/components/map_task/MapTaskMap";
import type { MapTaskCard    } from "@/hooks/live-chat/taskCardFrame";
import type { MapTaskReveal  } from "@/hooks/live-chat/taskRevealFrame";

// Tallest the map is drawn, so a tall map stays on screen beside the avatar
const MAP_PANEL_MAX_HEIGHT = "72vh";


// ================================================================================
// Map Task Map Panel
// ================================================================================
// How to play, over the participant's map with its route; or once the chat ends, both maps as one
export default function MapTaskMapPanel({map, reveal}: {
    map    : MapTaskCard;            // The participant's map from the backend
    reveal : MapTaskReveal | null;   // The avatar's map and path, once the chat ends (null until then)
}): ReactElement {
    return (
        <div className="rounded-2xl border border-chat-border! bg-chat-panel p-5! shadow-sm">
            {(reveal === null) ? (
                <>
                    {/* Heading and how to play */}
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-chat-subtext">
                        <BsMap aria-hidden="true" /> Your map
                    </div>
                    <h2 className="mt-1 text-2xl font-semibold text-chat-text">Describe the route</h2>
                    <p className="mt-2 text-lg leading-relaxed text-chat-text">
                        Guide the avatar along your red route, from the start to the finish. Its map is a little different from yours, so some landmarks may be missing or in another place.
                    </p>

                    {/* The map (its paper draws its own edge) */}
                    <div className="mt-4!">
                        <MapTaskMap shape={map.shape} landmarks={map.landmarks} route={map.route} maxHeight={MAP_PANEL_MAX_HEIGHT} label="Your map, with the route from the start to the finish" />
                        <p className="mt-2 text-sm text-chat-subtext">Shaded areas show how much space each landmark covers.</p>
                    </div>
                </>
            ) : (
                <>
                    {/* Heading, and what the combined map shows */}
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-chat-subtext">
                        <BsMap aria-hidden="true" /> Both maps
                    </div>
                    <h2 className="mt-1 text-2xl font-semibold text-chat-text">Where the avatar went</h2>
                    <p className="mt-2 text-lg leading-relaxed text-chat-text">
                        Here is your map again, with the path the avatar took on its own map drawn over it. Rings mark the landmarks your two maps didn't share.
                    </p>

                    {/* Both maps as one, and what each line and ring means */}
                    <div className="mt-4! text-chat-text">
                        <CombinedMap giver={map} follower={reveal} path={reveal.path} viewer="participant" maxHeight={MAP_PANEL_MAX_HEIGHT} />
                    </div>
                </>
            )}
        </div>
    );
}
