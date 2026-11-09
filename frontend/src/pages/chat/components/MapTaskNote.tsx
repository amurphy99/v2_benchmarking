/* What the participant does in the Map Task, shown beside the avatar.
--------------------------------------------------------------------------------
`@frontend/src/pages/chat/components/MapTaskNote`

The participant's map is on paper for now (the backend doesn't send it yet, and
the map files have no picture), so this only says what to do with it.

*/
import type { ReactElement } from "react";
import      { BsMap        } from "react-icons/bs";


// ================================================================================
// Map Task Note
// ================================================================================
// How to play: describe the route on your map, and the avatar follows it on its own
export default function MapTaskNote(): ReactElement {
    return (
        <div className="rounded-2xl border border-chat-border bg-chat-panel p-6 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-chat-subtext">
                <BsMap aria-hidden="true" /> Your map
            </div>
            <h2 className="mt-1 text-2xl font-semibold text-chat-text">Describe the route</h2>
            <p className="mt-3 text-lg leading-relaxed text-chat-text">
                Your paper map has a route drawn on it. Tell the avatar how to follow it, one step at a time.
            </p>
            <p className="mt-3 text-lg leading-relaxed text-chat-subtext">
                Its map is a little different from yours, so some landmarks may be missing or in another place.
            </p>
        </div>
    );
}
