/* What makes a Map Task's two maps differ, named for staff.
--------------------------------------------------------------------------------
`@frontend/src/components/map_task/MapDifferencesList`

Used under the maps on the admin live chat page and the staff map preview, where
the same landmarks are ringed on the maps. The differences are what the task is
about: the participant names a landmark the avatar lacks, or finds one it has
somewhere else.

*/
import type { ReactElement } from "react";

// From this project
import type { MapTaskLandmark } from "@/api";
import type { MapDifferences  } from "./mapTaskViews";

// Each kind of difference, in the order listed, with how it reads
const MAP_DIFFERENCE_ROWS: {key: keyof MapDifferences; label: string}[] = [
    {key: "onlyGiver",    label: "Only on the participant's map"        },
    {key: "onlyFollower", label: "Only on the avatar's map"             },
    {key: "moved",        label: "Somewhere else on the avatar's map"   },
    {key: "renamed",      label: "Called something else on the avatar's"},
];


// ================================================================================
// Map Differences List
// ================================================================================
// One line per kind of difference the maps have (or a note that they match)
export default function MapDifferencesList({differences}: {
    differences : MapDifferences;  // From `mapDifferences`
}): ReactElement {
    const rows = MAP_DIFFERENCE_ROWS.filter(({key}) => differences[key].length > 0);
    if (rows.length === 0) return <p className="text-xs text-admin-subtext">The two maps have the same landmarks in the same places.</p>;

    return (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
            {rows.map(({key, label}) => (
                <div key={key} className="contents">
                    <dt className="text-admin-subtext">{label}</dt>
                    <dd className="font-medium text-admin-text">{differences[key].map((landmark: MapTaskLandmark) => landmark.label).join(", ")}</dd>
                </div>
            ))}
        </dl>
    );
}
