/* A picture of the demo's made-up map, the way the avatar reads it.
--------------------------------------------------------------------------------
`@frontend/src/pages/avatar_demo/components/SampleMapPicture`

The avatar holds its map facing itself, so on screen we see only its back. This
draws the front, as the avatar reads it, so the Map Task examples' looks can be
followed: a look at the bridge (its top left) goes up and to the viewer's
right. The spots come from `utils/sampleMap`.

*/
import type { ReactElement } from "react";

// From this project
import type { DemoLandmark                                         } from "../utils/sampleMap";
import      { DEMO_MAP_LANDMARKS, DEMO_MAP_MISSING, DEMO_MAP_START } from "../utils/sampleMap";

// Where the avatar is, drawn like a landmark
const DEMO_MAP_START_SPOT: DemoLandmark = {name: "Start", emoji: "📍", at: DEMO_MAP_START};

// Every spot drawn: the landmarks, then the start
const DEMO_MAP_SPOTS: DemoLandmark[] = [...Object.values(DEMO_MAP_LANDMARKS), DEMO_MAP_START_SPOT];


// --------------------------------------------------------------------------------
// Sample Map Picture
// --------------------------------------------------------------------------------
// Draw the map's spots on folded paper, with a caption on how it is mirrored
export default function SampleMapPicture(): ReactElement {
    return (
        <figure>
            {/* Paper in the map's proportions (its folds as faint lines) */}
            <div className="relative aspect-[210/148] w-full overflow-hidden rounded-md border border-admin-borderStrong bg-admin-accentSoft">
                <div className="absolute inset-y-0 left-1/4 w-px bg-admin-border" />
                <div className="absolute inset-y-0 left-1/2 w-px bg-admin-border" />
                <div className="absolute inset-y-0 left-3/4 w-px bg-admin-border" />
                <div className="absolute inset-x-0 top-1/2 h-px bg-admin-border" />

                {/* Each spot, centered on its map coordinates */}
                {DEMO_MAP_SPOTS.map((spot: DemoLandmark) => (
                    <span
                        key       = {spot.name}
                        className = "absolute -translate-x-1/2 -translate-y-1/2 text-xl leading-none"
                        style     = {{left: `${spot.at[0] * 100}%`, top: `${spot.at[1] * 100}%`}}
                        title     = {spot.name}
                    >
                        {spot.emoji}
                    </span>
                ))}
            </div>

            {/* How it is mirrored, and what it lacks */}
            <figcaption className="mt-1 text-xs text-admin-subtext">
                The avatar's map, as it reads it ({DEMO_MAP_START_SPOT.emoji} marks where it is). We see the back, so its left is your right.
                There's no {DEMO_MAP_MISSING.emoji} {DEMO_MAP_MISSING.name.toLowerCase()} on it.
            </figcaption>
        </figure>
    );
}
