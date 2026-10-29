/* Demo controls for the Map Task map: holding it, and raising and lowering it.
--------------------------------------------------------------------------------
`@frontend/src/pages/avatar_demo/components/MapTaskGroup`

Shown for avatars whose plan catalog has the map. Each button runs one plan step
(a `prop` action, `AVATAR_PLANS.md` §3.3) straight on the avatar. The page
remounts it when the avatar changes, since a newly picked avatar starts without
a map.

*/
import type { ReactElement, RefObject } from "react";
import      { useState                } from "react";

// From this project
import      { btnClass, buttonSectionHeader, groupDivStyle } from "@/hooks/chat-listener/chat-controls/styles";
import type { PropAction                                   } from "@/hooks/live-chat/avatarPlanFrames";
import type { AvatarHandle                                 } from "@/pages/common/avatar/avatarRegistry";

// Each section's small label
const DEMO_SECTION_LABEL = "text-xs opacity-60";


// --------------------------------------------------------------------------------
// Map Task Group
// --------------------------------------------------------------------------------
// Hand the avatar the map or take it away, and raise or lower it by hand
export default function MapTaskGroup({avatarRef}: {
    avatarRef : RefObject<AvatarHandle | null>;   // Avatar the controls drive
}): ReactElement {
    // Whether the avatar was last handed the map
    const [holding, setHolding] = useState<boolean>(false);

    // Move the map with one `prop` step
    const moveMap = (prop: PropAction): void => { avatarRef.current?.runPlanStep?.({prop}); };

    // Hand it the map, or take it away
    const changeHolding = (on: boolean): void => {
        setHolding(on);
        moveMap({hold: on ? "map" : null, raise: null, move_ms: null});
    };

    return (
        <div className={groupDivStyle}>
            <div className={buttonSectionHeader}>Map Task</div>

            <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                {/* Holding the map */}
                <div>
                    <div className={DEMO_SECTION_LABEL}>Map</div>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                        <button className={btnClass(false, holding ? "primary"   : "secondary")} onClick={() => changeHolding(true )}>Hold the map</button>
                        <button className={btnClass(false, holding ? "secondary" : "primary"  )} onClick={() => changeHolding(false)}>Put it away</button>
                    </div>
                </div>

                {/* Raising and lowering it by hand */}
                <div>
                    <div className={DEMO_SECTION_LABEL}>Raise or lower it</div>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                        <button className={btnClass(!holding, "secondary")} disabled={!holding} onClick={() => moveMap({raise: 1, move_ms: null})}>Raise</button>
                        <button className={btnClass(!holding, "secondary")} disabled={!holding} onClick={() => moveMap({raise: 0, move_ms: null})}>Lower</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
